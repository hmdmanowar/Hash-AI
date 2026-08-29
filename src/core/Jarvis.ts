import type { AIModel } from '../models/AIModel.js'
import { ShortTermMemory } from '../memory/ShortTermMemory.js'
import { LongTermMemory, type MemoryRecord } from '../memory/LongTermMemory.js'

const DEFAULT_ASSISTANT_NAME = 'Jarvis'

function buildSystemPrompt(assistantName: string, relevantMemories: MemoryRecord[]): string {
  let prompt = `You are ${assistantName}, a helpful AI assistant. Keep answers clear and concise.`
  if (relevantMemories.length > 0) {
    const bullets = relevantMemories.map((memory) => `- (${memory.type}) ${memory.content}`).join('\n')
    prompt += `\n\nRelevant memory about the user, from earlier sessions:\n${bullets}`
  }
  return prompt
}

export interface JarvisOptions {
  memory?: ShortTermMemory
  // Persistent, cross-session memory (see memory/LongTermMemory.ts). Optional
  // — when omitted, Jarvis behaves exactly as it did before Phase 2 (no
  // retrieval, and remember/listMemories/forgetMemory throw a clear error
  // instead of silently doing nothing).
  longTermMemory?: LongTermMemory
  // Persona name only — never hardcoded into the system prompt, so it can
  // be set at startup (see config.ts's JARVIS_NAME) and changed later at
  // runtime via setAssistantName() once the system supports it, without
  // touching this class's logic.
  assistantName?: string
}

// The orchestrator: wires a model provider, short-term memory, and
// (optionally) long-term memory together behind one clean method. Later
// phases add the Planner, Decision Engine, Tool System and Permission
// Engine here — none of that exists yet.
export class Jarvis {
  private readonly memory: ShortTermMemory
  private readonly longTermMemory?: LongTermMemory
  private assistantName: string

  constructor(
    private readonly model: AIModel,
    options: JarvisOptions = {},
  ) {
    this.memory = options.memory ?? new ShortTermMemory()
    this.longTermMemory = options.longTermMemory
    this.assistantName = options.assistantName ?? DEFAULT_ASSISTANT_NAME
  }

  getAssistantName(): string {
    return this.assistantName
  }

  setAssistantName(name: string): void {
    this.assistantName = name
  }

  async chat(input: string): Promise<string> {
    this.memory.append({ role: 'user', content: input })

    const relevantMemories = this.longTermMemory?.retrieveRelevant(input) ?? []
    const response = await this.model.generate({
      messages: [
        { role: 'system', content: buildSystemPrompt(this.assistantName, relevantMemories) },
        ...this.memory.getHistory(),
      ],
    })

    this.memory.append({ role: 'assistant', content: response.content })
    return response.content
  }

  reset(): void {
    this.memory.clear()
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
  // recognizes the /remember, /memories and /forget commands and dispatches
  // to long-term memory; anything else falls through to a normal chat()
  // turn. Keeping this here (not duplicated per-interface) means every
  // interface gets memory commands for free.
  async handleInput(input: string): Promise<string> {
    const trimmed = input.trim()

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
