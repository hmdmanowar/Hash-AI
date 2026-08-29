import { DatabaseSync } from 'node:sqlite'

export type MemoryType = 'fact' | 'preference' | 'decision' | 'goal'

export interface MemoryRecord {
  id: number
  type: MemoryType
  content: string
  createdAt: string
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'i', 'in', 'is', 'it',
  'my', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'what', 'with', 'you',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
}

// Persistent, user-controlled memory — only written when the user explicitly
// asks (see cli/chat.ts's /remember command), never auto-extracted from
// conversation. Backed by node:sqlite (built into Node 22+, no extra
// dependency). Retrieval is plain keyword-overlap scoring, not embeddings —
// matches the roadmap's own "vector retrieval when needed" phasing; this is
// the "not needed yet" starting point.
export class LongTermMemory {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('fact','preference','decision','goal')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
  }

  remember(type: MemoryType, content: string): MemoryRecord {
    const createdAt = new Date().toISOString()
    const stmt = this.db.prepare('INSERT INTO memories (type, content, created_at) VALUES (?, ?, ?)')
    const result = stmt.run(type, content, createdAt)
    return { id: Number(result.lastInsertRowid), type, content, createdAt }
  }

  list(): MemoryRecord[] {
    const rows = this.db.prepare('SELECT id, type, content, created_at FROM memories ORDER BY id ASC').all() as {
      id: number
      type: MemoryType
      content: string
      created_at: string
    }[]
    return rows.map((row) => ({ id: row.id, type: row.type, content: row.content, createdAt: row.created_at }))
  }

  forget(id: number): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return result.changes > 0
  }

  retrieveRelevant(query: string, limit = 5): MemoryRecord[] {
    const queryTokens = new Set(tokenize(query))
    if (queryTokens.size === 0) return []

    return this.list()
      .map((memory) => {
        const memoryTokens = tokenize(memory.content)
        const score = memoryTokens.filter((token) => queryTokens.has(token)).length
        return { memory, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.memory.id - a.memory.id)
      .slice(0, limit)
      .map((entry) => entry.memory)
  }

  close(): void {
    this.db.close()
  }
}
