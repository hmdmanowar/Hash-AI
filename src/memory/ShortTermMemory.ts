import type { ChatMessage } from '../models/AIModel.js'

// Bounded in-process conversation history — enough for a single session's
// context window. Not persisted across restarts; durable, user-controlled
// memory is Phase 2 per the roadmap, not part of v0.1.
export class ShortTermMemory {
  private readonly history: ChatMessage[] = []

  constructor(private readonly maxMessages: number = 50) {}

  append(message: ChatMessage): void {
    this.history.push(message)
    if (this.history.length > this.maxMessages) {
      this.history.splice(0, this.history.length - this.maxMessages)
    }
  }

  getHistory(): ChatMessage[] {
    return [...this.history]
  }

  clear(): void {
    this.history.length = 0
  }
}
