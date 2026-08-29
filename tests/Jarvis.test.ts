import { describe, it, expect } from 'vitest'
import { Jarvis } from '../src/core/Jarvis.js'
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
})
