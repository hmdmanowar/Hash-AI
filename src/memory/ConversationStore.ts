import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import type { ChatMessage } from '../models/AIModel.js'

// Same node:sqlite-via-createRequire workaround as LongTermMemory.ts — see
// that file for why a plain import doesn't work under vite-node/Vitest.
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>

export type ConversationRole = 'user' | 'assistant'

export interface ConversationRecord {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  role: ConversationRole
  content: string
}

// Persists multiple conversations (each an ordered list of messages) for the
// web UI's history sidebar — the CLI has no need for this and stays on the
// single in-process ShortTermMemory. Deliberately no foreign-key constraint
// or ON DELETE CASCADE: node:sqlite's FK-enforcement default has changed
// across Node point releases and this repo pins no Node version, so
// deleteConversation() just issues two explicit statements instead.
export class ConversationStore {
  private readonly db: DatabaseSyncInstance
  // A monotonic write counter used to order conversations by recency of
  // update. updated_at (ISO string, millisecond resolution) isn't a safe
  // sort key on its own — two writes in the same millisecond would tie, and
  // unlike a real "last write wins" counter, an UPDATE never changes
  // SQLite's own rowid, so rowid can't be used as a tiebreaker either (it
  // still reflects original insertion order, not update recency). Seeded
  // from the highest seq already on disk so ordering stays correct across
  // process restarts.
  private nextSeq: number

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        seq INTEGER NOT NULL
      )
    `)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user','assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    const row = this.db.prepare('SELECT MAX(seq) AS maxSeq FROM conversations').get() as { maxSeq: number | null }
    this.nextSeq = (row.maxSeq ?? 0) + 1
  }

  createConversation(title: string): ConversationRecord {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at, seq) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, now, now, this.nextSeq++)
    return { id, title, createdAt: now, updatedAt: now }
  }

  listConversations(): ConversationRecord[] {
    const rows = this.db
      .prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY seq DESC')
      .all() as { id: string; title: string; created_at: string; updated_at: string }[]
    return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }))
  }

  getMessages(conversationId: string): ConversationMessage[] {
    const rows = this.db
      .prepare('SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC')
      .all(conversationId) as { role: ConversationRole; content: string }[]
    return rows.map((row) => ({ role: row.role, content: row.content }))
  }

  appendMessage(conversationId: string, message: ChatMessage & { role: ConversationRole }): void {
    const now = new Date().toISOString()
    this.db
      .prepare('INSERT INTO conversation_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
      .run(conversationId, message.role, message.content, now)
    this.db
      .prepare('UPDATE conversations SET updated_at = ?, seq = ? WHERE id = ?')
      .run(now, this.nextSeq++, conversationId)
  }

  renameConversation(id: string, title: string): boolean {
    const result = this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, id)
    return result.changes > 0
  }

  deleteConversation(id: string): boolean {
    this.db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?').run(id)
    const result = this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}
