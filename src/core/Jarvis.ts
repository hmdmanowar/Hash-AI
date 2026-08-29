import type { AIModel } from '../models/AIModel.js'
import { ShortTermMemory } from '../memory/ShortTermMemory.js'
import { LongTermMemory, type MemoryRecord } from '../memory/LongTermMemory.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Tool } from '../tools/Tool.js'
import { PermissionEngine, type RiskLevel } from '../permissions/PermissionEngine.js'

const DEFAULT_ASSISTANT_NAME = 'Jarvis'

function buildSystemPrompt(assistantName: string, relevantMemories: MemoryRecord[], toolRegistry?: ToolRegistry): string {
  let prompt = `You are ${assistantName}, a helpful AI assistant. Keep answers clear and concise.`

  if (relevantMemories.length > 0) {
    const bullets = relevantMemories.map((memory) => `- (${memory.type}) ${memory.content}`).join('\n')
    prompt += `\n\nRelevant memory about the user, from earlier sessions:\n${bullets}`
  }

  if (toolRegistry) {
    prompt += `\n\nYou have access to these tools:\n${toolRegistry.describeForPrompt()}\n\nTo use one, respond with EXACTLY one line and nothing else:\nTOOL_CALL: {"tool": "<name>", "args": { ... }}\nOtherwise, just answer normally in plain text. You may only request one tool per turn.`
  }

  return prompt
}

interface ParsedToolCall {
  tool: string
  args: Record<string, unknown>
}

// Only recognizes the call if it's the model's entire reply (matching the
// system prompt's "respond with EXACTLY one line and nothing else"
// instruction) — this avoids false-positives from a reply that merely
// mentions or explains the TOOL_CALL format.
function parseToolCall(content: string): ParsedToolCall | null {
  const match = content.trim().match(/^TOOL_CALL:\s*(\{[\s\S]*\})$/i)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as { tool?: unknown; args?: unknown }
    if (typeof parsed.tool !== 'string') return null
    const args = parsed.args && typeof parsed.args === 'object' ? (parsed.args as Record<string, unknown>) : {}
    return { tool: parsed.tool, args }
  } catch {
    return null
  }
}

interface PendingToolCall {
  tool: string
  args: Record<string, unknown>
  risk: RiskLevel
  relevantMemories: MemoryRecord[]
}

export interface JarvisOptions {
  memory?: ShortTermMemory
  // Persistent, cross-session memory (see memory/LongTermMemory.ts). Optional
  // — when omitted, Jarvis behaves exactly as it did before Phase 2 (no
  // retrieval, and remember/listMemories/forgetMemory throw a clear error
  // instead of silently doing nothing).
  longTermMemory?: LongTermMemory
  // Phase 3: concrete tools (filesystem/search/terminal) and the engine that
  // gates them. Both optional together — when omitted, Jarvis behaves
  // exactly as before Phase 3 (no tool section in the prompt, no tool-call
  // parsing at all).
  toolRegistry?: ToolRegistry
  permissionEngine?: PermissionEngine
  // Persona name only — never hardcoded into the system prompt, so it can
  // be set at startup (see config.ts's JARVIS_NAME) and changed later at
  // runtime via setAssistantName() once the system supports it, without
  // touching this class's logic.
  assistantName?: string
}

// The orchestrator: wires a model provider, short-term memory, long-term
// memory, and (Phase 3) tools together behind one clean method. This is
// still single-shot tool use — the model gets to request at most one tool
// per user turn, then must answer. Multi-step autonomous chaining is
// Phase 4 ("Agent"), deliberately not implemented here.
export class Jarvis {
  private readonly memory: ShortTermMemory
  private readonly longTermMemory?: LongTermMemory
  private readonly toolRegistry?: ToolRegistry
  private readonly permissionEngine?: PermissionEngine
  private assistantName: string
  private pendingToolCall?: PendingToolCall

  constructor(
    private readonly model: AIModel,
    options: JarvisOptions = {},
  ) {
    this.memory = options.memory ?? new ShortTermMemory()
    this.longTermMemory = options.longTermMemory
    this.toolRegistry = options.toolRegistry
    this.permissionEngine = options.permissionEngine
    this.assistantName = options.assistantName ?? DEFAULT_ASSISTANT_NAME
  }

  getAssistantName(): string {
    return this.assistantName
  }

  setAssistantName(name: string): void {
    this.assistantName = name
  }

  hasPendingToolCall(): boolean {
    return this.pendingToolCall !== undefined
  }

  async chat(input: string): Promise<string> {
    if (this.pendingToolCall) {
      return `You have a pending action awaiting approval: "${this.pendingToolCall.tool}". Reply /approve or /deny before continuing.`
    }

    this.memory.append({ role: 'user', content: input })
    const relevantMemories = this.longTermMemory?.retrieveRelevant(input) ?? []
    return this.requestModelReply(relevantMemories, true)
  }

  reset(): void {
    this.memory.clear()
    this.pendingToolCall = undefined
  }

  private async requestModelReply(relevantMemories: MemoryRecord[], allowToolCall: boolean): Promise<string> {
    const systemPrompt = buildSystemPrompt(this.assistantName, relevantMemories, allowToolCall ? this.toolRegistry : undefined)
    const response = await this.model.generate({
      messages: [{ role: 'system', content: systemPrompt }, ...this.memory.getHistory()],
    })

    const toolRequest = allowToolCall && this.toolRegistry ? parseToolCall(response.content) : null
    this.memory.append({ role: 'assistant', content: response.content })

    if (!toolRequest) {
      return response.content
    }

    const tool = this.toolRegistry!.get(toolRequest.tool)
    if (!tool) {
      const note = `[tool error] Unknown tool "${toolRequest.tool}".`
      this.memory.append({ role: 'user', content: note })
      return this.requestModelReply(relevantMemories, false)
    }

    if (this.permissionEngine?.needsApproval(tool.risk)) {
      this.pendingToolCall = { tool: tool.name, args: toolRequest.args, risk: tool.risk, relevantMemories }
      return `I'd like to run "${tool.name}" with ${JSON.stringify(toolRequest.args)} (risk: ${tool.risk}). Reply /approve or /deny.`
    }

    return this.executeToolAndContinue(tool, toolRequest.args, 'auto', relevantMemories)
  }

  private async executeToolAndContinue(
    tool: Tool,
    args: Record<string, unknown>,
    approvedBy: 'auto' | 'user',
    relevantMemories: MemoryRecord[],
  ): Promise<string> {
    let resultText: string
    let outcome: 'success' | 'error' = 'success'

    try {
      const result = await tool.execute(args)
      resultText = JSON.stringify(result)
    } catch (error) {
      outcome = 'error'
      resultText = error instanceof Error ? error.message : String(error)
    }

    this.permissionEngine?.record({ tool: tool.name, args, risk: tool.risk, outcome, approvedBy })
    this.memory.append({ role: 'user', content: `[tool result: ${tool.name}] ${resultText}` })
    return this.requestModelReply(relevantMemories, false)
  }

  private async resolveApproval(approved: boolean): Promise<string> {
    if (!this.pendingToolCall) {
      return 'No pending action to approve.'
    }

    const { tool: toolName, args, risk, relevantMemories } = this.pendingToolCall
    this.pendingToolCall = undefined

    if (!approved) {
      this.permissionEngine?.record({ tool: toolName, args, risk, outcome: 'denied', approvedBy: 'user' })
      const note = `Okay, I won't run "${toolName}".`
      this.memory.append({ role: 'assistant', content: note })
      return note
    }

    const tool = this.toolRegistry?.get(toolName)
    if (!tool) {
      return `[tool error] "${toolName}" is no longer available.`
    }
    return this.executeToolAndContinue(tool, args, 'user', relevantMemories)
  }

  private requireLongTermMemory(): LongTermMemory {
    if (!this.longTermMemory) {
      throw new Error('Long-term memory is not configured for this Jarvis instance')
    }
    return this.longTermMemory
  }

  remember(content: string): MemoryRecord {
    return this.requireLongTermMemory().remember('fact', content)
  }

  listMemories(): MemoryRecord[] {
    return this.requireLongTermMemory().list()
  }

  forgetMemory(id: number): boolean {
    return this.requireLongTermMemory().forget(id)
  }

  // Single entry point for every interface (CLI, HTTP API, future ones) —
  // recognizes /remember, /memories, /forget, and (Phase 3) /approve and
  // /deny, dispatching to the right method; anything else falls through to
  // a normal chat() turn. Keeping this here (not duplicated per-interface)
  // means every interface gets these commands for free.
  async handleInput(input: string): Promise<string> {
    const trimmed = input.trim()

    if (this.pendingToolCall) {
      if (/^\/approve$/i.test(trimmed)) return this.resolveApproval(true)
      if (/^\/deny$/i.test(trimmed)) return this.resolveApproval(false)
      return `You have a pending action awaiting approval: "${this.pendingToolCall.tool}". Reply /approve or /deny before continuing.`
    }

    const rememberMatch = trimmed.match(/^\/remember\s+(.+)$/is)
    if (rememberMatch) {
      const record = this.remember(rememberMatch[1].trim())
      return `Remembered (#${record.id}): ${record.content}`
    }

    if (/^\/memories$/i.test(trimmed)) {
      const records = this.listMemories()
      if (records.length === 0) return 'No memories stored yet.'
      return records.map((record) => `#${record.id} [${record.type}] ${record.content}`).join('\n')
    }

    const forgetMatch = trimmed.match(/^\/forget\s+(\d+)$/i)
    if (forgetMatch) {
      const id = Number(forgetMatch[1])
      const removed = this.forgetMemory(id)
      return removed ? `Forgot #${id}.` : `No memory found with id #${id}.`
    }

    return this.chat(input)
  }
}
