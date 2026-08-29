export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ModelRequest {
  messages: ChatMessage[]
}

export interface ModelResponse {
  content: string
}

// Every model provider (local or remote) implements this — Jarvis's core
// depends only on this interface, never on a concrete provider, so adding
// OpenAI/Claude/Gemini later means writing one new file, not touching core/.
export interface AIModel {
  generate(request: ModelRequest): Promise<ModelResponse>
}
