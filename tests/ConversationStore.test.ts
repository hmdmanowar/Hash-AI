import { describe, it, expect } from 'vitest'
import { ConversationStore } from '../src/memory/ConversationStore.js'

// ':memory:' — SQLite's in-memory mode, no disk I/O, nothing to clean up.
function makeStore() {
  return new ConversationStore(':memory:')
}

describe('ConversationStore', () => {
  it('createConversation() returns a record with an id and matching title', () => {
    const store = makeStore()
    const record = store.createConversation('First chat')
    expect(record.id).toBeTruthy()
    expect(record.title).toBe('First chat')
    expect(record.createdAt).toBe(record.updatedAt)
  })

  it('listConversations() orders most-recently-updated first', () => {
    const store = makeStore()
    const first = store.createConversation('First')
    store.createConversation('Second')

    // Bump "first"'s updated_at past "second"'s by appending to it.
    store.appendMessage(first.id, { role: 'user', content: 'hello again' })

    const titles = store.listConversations().map((c) => c.title)
    expect(titles).toEqual(['First', 'Second'])
  })

  it('appendMessage() + getMessages() preserves role, content, and order', () => {
    const store = makeStore()
    const conversation = store.createConversation('Chat')

    store.appendMessage(conversation.id, { role: 'user', content: 'hi' })
    store.appendMessage(conversation.id, { role: 'assistant', content: 'hello!' })

    expect(store.getMessages(conversation.id)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' },
    ])
  })

  it('getMessages() returns an empty array for an unknown conversation', () => {
    const store = makeStore()
    expect(store.getMessages('does-not-exist')).toEqual([])
  })

  it('renameConversation() updates the title and returns true; false for an unknown id', () => {
    const store = makeStore()
    const conversation = store.createConversation('Old title')

    expect(store.renameConversation(conversation.id, 'New title')).toBe(true)
    expect(store.listConversations()[0].title).toBe('New title')
    expect(store.renameConversation('does-not-exist', 'x')).toBe(false)
  })

  it('deleteConversation() removes the conversation and its messages; false for an unknown id', () => {
    const store = makeStore()
    const conversation = store.createConversation('Temporary')
    store.appendMessage(conversation.id, { role: 'user', content: 'hi' })

    expect(store.deleteConversation(conversation.id)).toBe(true)
    expect(store.listConversations()).toEqual([])
    expect(store.getMessages(conversation.id)).toEqual([])
    expect(store.deleteConversation(conversation.id)).toBe(false)
  })
})
