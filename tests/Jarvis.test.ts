import { describe, it, expect } from 'vitest'
import { Jarvis } from '../src/core/Jarvis.js'
import { LongTermMemory } from '../src/memory/LongTermMemory.js'
import type { AIModel, ModelRequest, ModelResponse } from '../src/models/AIModel.js'

// Never depends on Ollama actually running — Jarvis's core only knows about
// the AIModel interface, so a fake implementation is enough to test it.
class MockModel implements AIModel {
  public receivedRequests: ModelRequest[] = []

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.receivedRequests.push(request)
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === 'user')
    return { content: `echo: ${lastUserMessage?.content ?? ''}` }
  }
}

describe('Jarvis', () => {
  it('returns the model response', async () => {
    const jarvis = new Jarvis(new MockModel())
    const reply = await jarvis.chat('hello')
    expect(reply).toBe('echo: hello')
  })

  it('carries prior turns into later requests (short-term memory)', async () => {
    const model = new MockModel()
    const jarvis = new Jarvis(model)

    await jarvis.chat('my name is Sam')
    await jarvis.chat('what is my name?')

    const secondRequest = model.receivedRequests[1]
    const contents = secondRequest.messages.map((m) => m.content)
    expect(contents).toContain('my name is Sam')
    expect(contents).toContain('what is my name?')
  })

  it('reset() clears memory so a new conversation starts fresh', async () => {
    const model = new MockModel()
    const jarvis = new Jarvis(model)

    await jarvis.chat('first turn')
    jarvis.reset()
    await jarvis.chat('second turn')

    const requestAfterReset = model.receivedRequests[1]
    const userMessages = requestAfterReset.messages.filter((m) => m.role === 'user')
    expect(userMessages).toEqual([{ role: 'user', content: 'second turn' }])
  })

  it('injects relevant long-term memory into the system prompt', async () => {
    const model = new MockModel()
    const longTermMemory = new LongTermMemory(':memory:')
    longTermMemory.remember('preference', 'The user prefers TypeScript over JavaScript')
    const jarvis = new Jarvis(model, { longTermMemory })

    await jarvis.chat('Should I use TypeScript or JavaScript?')

    const systemMessage = model.receivedRequests[0].messages.find((m) => m.role === 'system')
    expect(systemMessage?.content).toContain('TypeScript')
  })

  it('does not touch long-term memory when none is configured', async () => {
    const jarvis = new Jarvis(new MockModel())
    await expect(jarvis.chat('hello')).resolves.toBe('echo: hello')
    expect(() => jarvis.remember('x')).toThrow('Long-term memory is not configured')
  })

  describe('handleInput', () => {
    it('/remember stores a fact and confirms it', async () => {
      const jarvis = new Jarvis(new MockModel(), { longTermMemory: new LongTermMemory(':memory:') })
      const reply = await jarvis.handleInput('/remember I prefer dark mode')
      expect(reply).toContain('Remembered')
      expect(reply).toContain('I prefer dark mode')
    })

    it('/memories lists what has been remembered', async () => {
      const jarvis = new Jarvis(new MockModel(), { longTermMemory: new LongTermMemory(':memory:') })
      await jarvis.handleInput('/remember I prefer dark mode')
      const reply = await jarvis.handleInput('/memories')
      expect(reply).toContain('I prefer dark mode')
    })

    it('/forget removes a memory by id', async () => {
      const jarvis = new Jarvis(new MockModel(), { longTermMemory: new LongTermMemory(':memory:') })
      const confirmation = await jarvis.handleInput('/remember I prefer dark mode')
      const id = confirmation.match(/#(\d+)/)?.[1]

      const forgetReply = await jarvis.handleInput(`/forget ${id}`)
      expect(forgetReply).toContain('Forgot')

      const listReply = await jarvis.handleInput('/memories')
      expect(listReply).toBe('No memories stored yet.')
    })

    it('falls through to a normal chat turn for anything else', async () => {
      const jarvis = new Jarvis(new MockModel())
      const reply = await jarvis.handleInput('just a regular message')
      expect(reply).toBe('echo: just a regular message')
    })
  })
})
