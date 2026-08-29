import type { AIModel } from '../models/AIModel.js'
import { ShortTermMemory } from '../memory/ShortTermMemory.js'

const DEFAULT_ASSISTANT_NAME = 'Jarvis'

function buildSystemPrompt(assistantName: string): string {
  return `You are ${assistantName}, a helpful AI assistant. Keep answers clear and concise.`
}

export interface JarvisOptions {
  memory?: ShortTermMemory
  // Persona name only — never hardcoded into the system prompt, so it can
  // be set at startup (see config.ts's JARVIS_NAME) and changed later at
  // runtime via setAssistantName() once the system supports it, without
  // touching this class's logic.
  assistantName?: string
}

// The v0.1 orchestrator: wires a model provider and short-term memory
// together behind one clean method. Later phases add the Planner, Decision
// Engine, Tool System and Permission Engine here — none of that exists yet.
export class Jarvis {
  private readonly memory: ShortTermMemory
  private assistantName: string

  constructor(
    private readonly model: AIModel,
    options: JarvisOptions = {},
  ) {
    this.memory = options.memory ?? new ShortTermMemory()
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

    const response = await this.model.generate({
      messages: [{ role: 'system', content: buildSystemPrompt(this.assistantName) }, ...this.memory.getHistory()],
    })

    this.memory.append({ role: 'assistant', content: response.content })
    return response.content
  }

  reset(): void {
    this.memory.clear()
  }
}
