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

  it('appendMessage() + getMessages() preserves role, content, timestamp, and order', () => {
    const store = makeStore()
    const conversation = store.createConversation('Chat')

    store.appendMessage(conversation.id, { role: 'user', content: 'hi' })
    store.appendMessage(conversation.id, { role: 'assistant', content: 'hello!' })

    const messages = store.getMessages(conversation.id)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hi' })
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'hello!' })
    expect(messages[0].createdAt).toBeTruthy()
  })

  it('appendMessage() with images persists them; getMessages() omits the field when absent', () => {
    const store = makeStore()
    const conversation = store.createConversation('Chat')

    store.appendMessage(conversation.id, { role: 'user', content: 'what is this?', images: ['base64-a', 'base64-b'] })
    store.appendMessage(conversation.id, { role: 'assistant', content: 'a cat' })

    const messages = store.getMessages(conversation.id)
    expect(messages[0].images).toEqual(['base64-a', 'base64-b'])
    expect(messages[1].images).toBeUndefined()
  })

  it('truncate() drops everything from keepCount onward', () => {
    const store = makeStore()
    const conversation = store.createConversation('Chat')

    store.appendMessage(conversation.id, { role: 'user', content: 'one' })
    store.appendMessage(conversation.id, { role: 'assistant', content: 'two' })
    store.appendMessage(conversation.id, { role: 'user', content: 'three' })

    store.truncate(conversation.id, 1)

    expect(store.getMessages(conversation.id).map((m) => m.content)).toEqual(['one'])
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
