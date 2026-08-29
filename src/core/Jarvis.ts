import type { AIModel, ChatMessage } from '../models/AIModel.js'
import { ShortTermMemory } from '../memory/ShortTermMemory.js'
import { LongTermMemory, type MemoryRecord } from '../memory/LongTermMemory.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { Tool } from '../tools/Tool.js'
import { PermissionEngine, type RiskLevel } from '../permissions/PermissionEngine.js'

const DEFAULT_ASSISTANT_NAME = 'Jarvis'
const DEFAULT_MAX_AGENT_STEPS = 5

function buildSystemPrompt(assistantName: string, relevantMemories: MemoryRecord[], toolRegistry?: ToolRegistry): string {
  let prompt = `You are ${assistantName}, a helpful AI assistant. Keep answers clear and concise.`

  if (relevantMemories.length > 0) {
    const bullets = relevantMemories.map((memory) => `- (${memory.type}) ${memory.content}`).join('\n')
    prompt += `\n\nRelevant memory about the user, from earlier sessions:\n${bullets}`
  }

  if (toolRegistry) {
    prompt += `\n\nYou have access to these tools:\n${toolRegistry.describeForPrompt()}\n\nTools are OPTIONAL — most requests need no tool at all. Do NOT confuse "write me an essay/poem/story/code/email" with the write_file tool: unless the user's message explicitly mentions a file, filename, or saving/writing something TO DISK, they want the content itself typed directly in your reply as plain text, not written to a file. Example: "write an essay about India" → just write the essay in your reply. "save this essay to essay.txt" → that one uses write_file. If you can answer directly from your own knowledge or by writing something yourself, do that in plain text and do NOT call a tool. Only use a tool when the task genuinely requires reading, writing, searching real files, or running a real command in the user's workspace.\n\nTo use one, respond with EXACTLY one line and nothing else:\nTOOL_CALL: {"tool": "<name>", "args": { ... }}\n\nCRITICAL: Request only ONE tool call per reply, then STOP — do not write anything after it, and do not call more than one tool in the same reply even if the task needs several steps. The real result will be given back to you afterward; only then should you decide the next step. Never invent, guess, or write out what a tool's result "would" look like — you have not run it yet, so you do not know. Wait for the real result every time.`
  }

  return prompt
}

interface ParsedToolCall {
  tool: string
  args: Record<string, unknown>
}

// Extracts the FIRST well-formed TOOL_CALL from the reply, wherever it
// appears — not just when it's the model's entire response. Live testing
// showed weaker local models don't reliably stop after one call: given a
// multi-step task, qwen2.5-coder sometimes strings several TOOL_CALL lines
// together and even fabricates fake "results" in the trailing text. Rather
// than reject the whole reply as unparseable in that case (which surfaced
// the hallucinated text to the user as if it were a real answer), find and
// run only the first real call and silently discard everything after it —
// the model sees the genuine result on the next loop turn instead.
function parseToolCall(content: string): ParsedToolCall | null {
  const marker = /TOOL_CALL:\s*/i
  const markerMatch = content.match(marker)
  if (!markerMatch || markerMatch.index === undefined) return null

  const afterMarker = content.slice(markerMatch.index + markerMatch[0].length)
  if (!afterMarker.startsWith('{')) return null

  const jsonText = extractBalancedJsonObject(afterMarker)
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText) as { tool?: unknown; args?: unknown }
    if (typeof parsed.tool !== 'string') return null
    const args = parsed.args && typeof parsed.args === 'object' ? (parsed.args as Record<string, unknown>) : {}
    return { tool: parsed.tool, args }
  } catch {
    return null
  }
}

// Returns the substring from index 0 up to (and including) the closing
// brace that balances the opening one at index 0, respecting string
// literals so a brace inside a quoted arg value doesn't miscount. Returns
// null if the braces never balance (a truncated/malformed object).
function extractBalancedJsonObject(text: string): string | null {
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (ch === '\\') {
      escapeNext = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(0, i + 1)
    }
  }
  return null
}

interface PendingToolCall {
  tool: string
  args: Record<string, unknown>
  risk: RiskLevel
  relevantMemories: MemoryRecord[]
  // How many steps were already taken *before* this one, in the same
  // multi-step turn — so approving it resumes the same budget instead of
  // resetting it.
  stepsUsed: number
  // Which model this turn picked (text or vision) — approving resumes with
  // the same one rather than re-deciding from scratch.
  model: AIModel
}

export interface TraceEntry {
  tool: string
  outcome: 'success' | 'error'
}

export interface JarvisOptions {
  memory?: ShortTermMemory
  // Persistent, cross-session memory (see memory/LongTermMemory.ts). Optional
  // — when omitted, Jarvis behaves exactly as it did before Phase 2 (no
  // retrieval, and remember/listMemories/forgetMemory throw a clear error
  // instead of silently doing nothing).
  longTermMemory?: LongTermMemory
  // Phase 3/4: concrete tools (filesystem/search/terminal) and the engine
  // that gates them. Both optional together — when omitted, Jarvis behaves
  // exactly as before Phase 3 (no tool section in the prompt, no tool-call
  // parsing at all).
  toolRegistry?: ToolRegistry
  permissionEngine?: PermissionEngine
  // Phase 4: how many tool calls the model may chain in a single turn
  // before it's forced to stop and report back, even mid-plan. A hard cap,
  // not a suggestion — this is what keeps "multi-step" from becoming
  // "unbounded."
  maxAgentSteps?: number
  // Persona name only — never hardcoded into the system prompt, so it can
  // be set at startup (see config.ts's JARVIS_NAME) and changed later at
  // runtime via setAssistantName() once the system supports it, without
  // touching this class's logic.
  assistantName?: string
  // Phase 5: a separate multimodal model used only for the turn a user
  // attaches an image to — `model` stays the default for plain text (a
  // coding-focused model is generally better at that than a vision model).
  // Optional: when omitted, an image-bearing turn just falls back to `model`
  // as-is (it will likely ignore or error on the images field).
  visionModel?: AIModel
}

// The orchestrator: wires a model provider, short-term memory, long-term
// memory, and tools together behind one clean method. Phase 4 turns the
// old single-shot tool use into a step-counted loop: the model can chain
// multiple tool calls toward a goal within one turn, up to maxAgentSteps,
// pausing for approval on any high-risk step and resuming the same budget
// afterward. This is still bounded per-turn autonomy, not an unattended
// background loop — that's Phase 8.
export class Jarvis {
  private readonly memory: ShortTermMemory
  private readonly longTermMemory?: LongTermMemory
  private readonly toolRegistry?: ToolRegistry
  private readonly permissionEngine?: PermissionEngine
  private readonly maxAgentSteps: number
  private assistantName: string
  private pendingToolCall?: PendingToolCall
  private lastTrace: TraceEntry[] = []
  // Signature of the most recently requested tool call in the current turn
  // — lets runAgentLoop detect a model stuck repeating the exact same call
  // instead of burning the whole step budget on it (observed with weaker
  // local models on tasks that need no tool at all, e.g. asking for an
  // essay: it would call search_code/write_file with near-identical args
  // over and over rather than just answering in text).
  private lastToolCallSignature?: string

  private readonly visionModel?: AIModel

  constructor(
    private readonly model: AIModel,
    options: JarvisOptions = {},
  ) {
    this.memory = options.memory ?? new ShortTermMemory()
    this.longTermMemory = options.longTermMemory
    this.toolRegistry = options.toolRegistry
    this.permissionEngine = options.permissionEngine
    this.maxAgentSteps = options.maxAgentSteps ?? DEFAULT_MAX_AGENT_STEPS
    this.assistantName = options.assistantName ?? DEFAULT_ASSISTANT_NAME
    this.visionModel = options.visionModel
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

  // The steps taken during the most recently completed (or in-progress)
  // turn — cleared at the start of every fresh chat() call, not on a
  // resume after approval, so it reflects the whole turn once it finishes.
  getLastTrace(): TraceEntry[] {
    return [...this.lastTrace]
  }

  async chat(input: string, images?: string[]): Promise<string> {
    if (this.pendingToolCall) {
      return `You have a pending action awaiting approval: "${this.pendingToolCall.tool}". Reply /approve or /deny before continuing.`
    }

    this.memory.append({ role: 'user', content: input, images })
    this.lastTrace = []
    this.lastToolCallSignature = undefined
    const relevantMemories = this.longTermMemory?.retrieveRelevant(input) ?? []
    // Only THIS turn's images decide the model — a later plain-text
    // follow-up goes back to the default model, even though the image
    // stays visible in history to whichever model handles that turn.
    const activeModel = images && images.length > 0 ? (this.visionModel ?? this.model) : this.model
    return this.runAgentLoop(relevantMemories, 0, activeModel)
  }

  reset(): void {
    this.memory.clear()
    this.pendingToolCall = undefined
    this.lastTrace = []
    this.lastToolCallSignature = undefined
  }

  // Replaces short-term memory with the given history and no model calls —
  // used by the web API to restore a persisted conversation when the user
  // switches to it (see src/memory/ConversationStore.ts). Also clears
  // pending/trace state like reset() so this is self-contained regardless
  // of what the instance was doing beforehand.
  loadHistory(messages: ChatMessage[]): void {
    this.memory.clear()
    for (const message of messages) this.memory.append(message)
    this.pendingToolCall = undefined
    this.lastTrace = []
    this.lastToolCallSignature = undefined
  }

  // A model that isn't the configured vision model may not just ignore an
  // `images` field — live testing showed Ollama hard-errors ("Multimodal
  // data provided, but model does not support multimodal requests") on ANY
  // request containing one, even on an older message that isn't the current
  // turn. Once an image has ever been sent, every later plain-text turn
  // would otherwise break for good. Stripping images from history when
  // routing to a non-vision model keeps old turns readable as text while
  // avoiding the crash; the vision model still gets the real images.
  private historyFor(model: AIModel): ChatMessage[] {
    const history = this.memory.getHistory()
    if (model === this.visionModel) return history
    return history.map((message) => (message.images ? { role: message.role, content: message.content } : message))
  }

  private async runAgentLoop(relevantMemories: MemoryRecord[], stepsUsed: number, model: AIModel): Promise<string> {
    if (stepsUsed >= this.maxAgentSteps) {
      return `I've taken ${stepsUsed} action${stepsUsed === 1 ? '' : 's'} but haven't finished yet. Let me know if you'd like me to keep going.`
    }

    const systemPrompt = buildSystemPrompt(this.assistantName, relevantMemories, this.toolRegistry)
    const response = await model.generate({
      messages: [{ role: 'system', content: systemPrompt }, ...this.historyFor(model)],
    })

    const toolRequest = this.toolRegistry ? parseToolCall(response.content) : null
    this.memory.append({ role: 'assistant', content: response.content })

    if (!toolRequest) {
      return response.content
    }

    const tool = this.toolRegistry!.get(toolRequest.tool)
    if (!tool) {
      const note = `[tool error] Unknown tool "${toolRequest.tool}".`
      this.memory.append({ role: 'user', content: note })
      this.lastTrace.push({ tool: toolRequest.tool, outcome: 'error' })
      return this.runAgentLoop(relevantMemories, stepsUsed + 1, model)
    }

    const signature = JSON.stringify({ tool: toolRequest.tool, args: toolRequest.args })
    if (signature === this.lastToolCallSignature) {
      this.lastToolCallSignature = undefined
      return `I noticed I was about to repeat the exact same "${tool.name}" call again without making progress, so I've stopped instead of using up the rest of my step budget. Could you rephrase what you'd like, or let me know if this really does need that action repeated?`
    }
    this.lastToolCallSignature = signature

    if (this.permissionEngine?.needsApproval(tool.risk)) {
      this.pendingToolCall = { tool: tool.name, args: toolRequest.args, risk: tool.risk, relevantMemories, stepsUsed, model }
      return `I'd like to run "${tool.name}" with ${JSON.stringify(toolRequest.args)} (risk: ${tool.risk}). Reply /approve or /deny.`
    }

    return this.executeToolAndContinue(tool, toolRequest.args, 'auto', relevantMemories, stepsUsed, model)
  }

  private async executeToolAndContinue(
    tool: Tool,
    args: Record<string, unknown>,
    approvedBy: 'auto' | 'user',
    relevantMemories: MemoryRecord[],
    stepsUsed: number,
    model: AIModel,
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
    this.lastTrace.push({ tool: tool.name, outcome })
    this.memory.append({ role: 'user', content: `[tool result: ${tool.name}] ${resultText}` })
    return this.runAgentLoop(relevantMemories, stepsUsed + 1, model)
  }

  private async resolveApproval(approved: boolean): Promise<string> {
    if (!this.pendingToolCall) {
      return 'No pending action to approve.'
    }

    const { tool: toolName, args, risk, relevantMemories, stepsUsed, model } = this.pendingToolCall
    this.pendingToolCall = undefined

    if (!approved) {
      this.permissionEngine?.record({ tool: toolName, args, risk, outcome: 'denied', approvedBy: 'user' })
      this.lastTrace.push({ tool: toolName, outcome: 'error' })
      const note = `Okay, I won't run "${toolName}".`
      this.memory.append({ role: 'assistant', content: note })
      return note
    }

    const tool = this.toolRegistry?.get(toolName)
    if (!tool) {
      return `[tool error] "${toolName}" is no longer available.`
    }
    return this.executeToolAndContinue(tool, args, 'user', relevantMemories, stepsUsed, model)
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
  // recognizes /remember, /memories, /forget, and /approve and /deny,
  // dispatching to the right method; anything else falls through to a
  // normal chat() turn. Keeping this here (not duplicated per-interface)
  // means every interface gets these commands for free.
  async handleInput(input: string, images?: string[]): Promise<string> {
    const trimmed = input.trim()

    // /approve and /deny are recognized unconditionally, not just while a
    // call is pending — resolveApproval() already reports "No pending
    // action" gracefully when there's nothing to resolve. Checking these
    // only inside the pendingToolCall branch (as before) meant typing
    // /approve with nothing pending fell through to chat() and got sent to
    // the model as a literal message, which it could misread as "continue"
    // and hallucinate a response to.
    if (/^\/approve$/i.test(trimmed)) return this.resolveApproval(true)
    if (/^\/deny$/i.test(trimmed)) return this.resolveApproval(false)

    if (this.pendingToolCall) {
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

    return this.chat(input, images)
  }
}
