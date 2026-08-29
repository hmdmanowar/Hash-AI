import { describe, it, expect } from 'vitest'
import { ShortTermMemory } from '../src/memory/ShortTermMemory.js'

describe('ShortTermMemory', () => {
  it('returns messages in the order they were appended', () => {
    const memory = new ShortTermMemory()
    memory.append({ role: 'user', content: 'hi' })
    memory.append({ role: 'assistant', content: 'hello' })

    expect(memory.getHistory()).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('drops the oldest messages once the bound is exceeded', () => {
    const memory = new ShortTermMemory(2)
    memory.append({ role: 'user', content: 'one' })
    memory.append({ role: 'user', content: 'two' })
    memory.append({ role: 'user', content: 'three' })

    expect(memory.getHistory()).toEqual([
      { role: 'user', content: 'two' },
      { role: 'user', content: 'three' },
    ])
  })

  it('clear() empties the history', () => {
    const memory = new ShortTermMemory()
    memory.append({ role: 'user', content: 'hi' })
    memory.clear()

    expect(memory.getHistory()).toEqual([])
  })

  it('getHistory() returns a copy, not the live internal array', () => {
    const memory = new ShortTermMemory()
    memory.append({ role: 'user', content: 'hi' })
    const snapshot = memory.getHistory()
    memory.append({ role: 'user', content: 'again' })

    expect(snapshot).toHaveLength(1)
  })
})
