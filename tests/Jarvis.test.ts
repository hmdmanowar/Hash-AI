import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Jarvis } from '../src/core/Jarvis.js'
import { LongTermMemory } from '../src/memory/LongTermMemory.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { PermissionEngine } from '../src/permissions/PermissionEngine.js'
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

// Returns each response in `script` in order, then repeats the last one —
// used to simulate a model that first requests a tool, then (once it sees
// the tool result in the next request) gives a final plain-text answer.
class ScriptedModel implements AIModel {
  public receivedRequests: ModelRequest[] = []
  private step = 0

  constructor(private readonly script: string[]) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.receivedRequests.push(request)
    const content = this.script[Math.min(this.step, this.script.length - 1)]
    this.step += 1
    return { content }
  }
}

function makeSandbox() {
  // A parent temp dir holding both the tool sandbox and the audit log, kept
  // separate so the audit log itself never shows up inside list_directory
  // results from the tests below.
  const parent = mkdtempSync(join(tmpdir(), 'jarvis-tools-test-'))
  const workspaceRoot = join(parent, 'workspace')
  const auditLogPath = join(parent, 'audit.log')
  return {
    workspaceRoot,
    toolRegistry: new ToolRegistry(workspaceRoot),
    permissionEngine: new PermissionEngine(auditLogPath),
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
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

  describe('tool calls', () => {
    it('executes a low-risk tool automatically and returns the follow-up answer', async () => {
      const sandbox = makeSandbox()
      try {
        const model = new ScriptedModel([
          'TOOL_CALL: {"tool": "list_directory", "args": {}}',
          'The workspace is empty.',
        ])
        const jarvis = new Jarvis(model, { toolRegistry: sandbox.toolRegistry, permissionEngine: sandbox.permissionEngine })

        const reply = await jarvis.chat('What files are in the workspace?')

        expect(reply).toBe('The workspace is empty.')
        expect(model.receivedRequests).toHaveLength(2)
        expect(jarvis.hasPendingToolCall()).toBe(false)
      } finally {
        sandbox.cleanup()
      }
    })

    it('feeds the tool result back to the model for the follow-up turn', async () => {
      const sandbox = makeSandbox()
      try {
        const model = new ScriptedModel([
          'TOOL_CALL: {"tool": "list_directory", "args": {}}',
          'ok',
        ])
        const jarvis = new Jarvis(model, { toolRegistry: sandbox.toolRegistry, permissionEngine: sandbox.permissionEngine })

        await jarvis.chat('list files')

        const followUp = model.receivedRequests[1].messages.map((m) => m.content).join('\n')
        expect(followUp).toContain('tool result: list_directory')
      } finally {
        sandbox.cleanup()
      }
    })

    it('does not request a tool call at all when no tool registry is configured', async () => {
      // MockModel just echoes — this confirms the base "no tools" behavior
      // from before Phase 3 is unaffected when toolRegistry is omitted.
      const jarvis = new Jarvis(new MockModel())
      const reply = await jarvis.chat('list files')
      expect(reply).toBe('echo: list files')
    })

    it('a high-risk tool call is held for approval instead of executing immediately', async () => {
      const sandbox = makeSandbox()
      try {
        const model = new ScriptedModel(['TOOL_CALL: {"tool": "run_command", "args": {"command": "echo hi"}}'])
        const jarvis = new Jarvis(model, { toolRegistry: sandbox.toolRegistry, permissionEngine: sandbox.permissionEngine })

        const reply = await jarvis.chat('run echo hi')

        expect(reply).toContain('run_command')
        expect(reply).toContain('/approve')
        expect(jarvis.hasPendingToolCall()).toBe(true)
      } finally {
        sandbox.cleanup()
      }
    })

    it('/approve runs the pending high-risk tool and returns the follow-up answer', async () => {
      const sandbox = makeSandbox()
      try {
        const model = new ScriptedModel([
          'TOOL_CALL: {"tool": "run_command", "args": {"command": "echo hi"}}',
          'Done — it printed hi.',
        ])
        const jarvis = new Jarvis(model, { toolRegistry: sandbox.toolRegistry, permissionEngine: sandbox.permissionEngine })

        await jarvis.chat('run echo hi')
        const reply = await jarvis.handleInput('/approve')

        expect(reply).toBe('Done — it printed hi.')
        expect(jarvis.hasPendingToolCall()).toBe(false)
      } finally {
        sandbox.cleanup()
      }
    })

    it('/deny cancels the pending tool call without executing it', async () => {
      const sandbox = makeSandbox()
      try {
        const model = new ScriptedModel(['TOOL_CALL: {"tool": "run_command", "args": {"command": "echo hi"}}'])
        const jarvis = new Jarvis(model, { toolRegistry: sandbox.toolRegistry, permissionEngine: sandbox.permissionEngine })

        await jarvis.chat('run echo hi')
        const reply = await jarvis.handleInput('/deny')

        expect(reply).toContain("won't run")
        expect(jarvis.hasPendingToolCall()).toBe(false)
      } finally {
        sandbox.cleanup()
      }
    })

    it('blocks unrelated input while an approval is pending, with a reminder', async () => {
      const sandbox = makeSandbox()
      try {
        const model = new ScriptedModel(['TOOL_CALL: {"tool": "run_command", "args": {"command": "echo hi"}}'])
        const jarvis = new Jarvis(model, { toolRegistry: sandbox.toolRegistry, permissionEngine: sandbox.permissionEngine })

        await jarvis.chat('run echo hi')
        const reply = await jarvis.handleInput('never mind, something else')

        expect(reply).toContain('/approve')
        expect(reply).toContain('/deny')
        expect(jarvis.hasPendingToolCall()).toBe(true)
      } finally {
        sandbox.cleanup()
      }
    })
  })
})
