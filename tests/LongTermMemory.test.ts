import { describe, it, expect } from 'vitest'
import { LongTermMemory } from '../src/memory/LongTermMemory.js'

// ':memory:' — SQLite's in-memory mode, no disk I/O, nothing to clean up.
function makeMemory() {
  return new LongTermMemory(':memory:')
}

describe('LongTermMemory', () => {
  it('remember() returns the stored record with an id', () => {
    const memory = makeMemory()
    const record = memory.remember('fact', 'The user prefers TypeScript over JavaScript')
    expect(record.id).toBeGreaterThan(0)
    expect(record.type).toBe('fact')
    expect(record.content).toBe('The user prefers TypeScript over JavaScript')
  })

  it('list() returns everything stored, in insertion order', () => {
    const memory = makeMemory()
    memory.remember('fact', 'first')
    memory.remember('goal', 'second')

    const records = memory.list()
    expect(records.map((r) => r.content)).toEqual(['first', 'second'])
  })

  it('forget() removes a record and returns true; returns false for an unknown id', () => {
    const memory = makeMemory()
    const record = memory.remember('fact', 'temporary')

    expect(memory.forget(record.id)).toBe(true)
    expect(memory.list()).toEqual([])
    expect(memory.forget(999)).toBe(false)
  })

  it('retrieveRelevant() ranks a keyword-matching memory above a non-matching one', () => {
    const memory = makeMemory()
    memory.remember('preference', 'The user prefers TypeScript over JavaScript')
    memory.remember('fact', 'The user lives in Bengaluru')

    const results = memory.retrieveRelevant('Do I prefer TypeScript or JavaScript?')
    expect(results).toHaveLength(1)
    expect(results[0].content).toContain('TypeScript')
  })

  it('retrieveRelevant() returns nothing when the query has no meaningful overlap', () => {
    const memory = makeMemory()
    memory.remember('fact', 'The user lives in Bengaluru')

    expect(memory.retrieveRelevant('what is the weather like')).toEqual([])
  })
})
