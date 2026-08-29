import 'dotenv/config'

export interface JarvisConfig {
  ollamaHost: string
  model: string
  // The persona name the assistant introduces itself as — kept separate
  // from the project/package name ("jarvis"), which never changes. This is
  // user-configurable now (env var) and intended to become runtime-renamable
  // once the system is further along (see Jarvis.setAssistantName).
  assistantName: string
}

export function loadConfig(): JarvisConfig {
  return {
    ollamaHost: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
    model: process.env.JARVIS_MODEL ?? 'qwen2.5-coder',
    assistantName: process.env.JARVIS_NAME ?? 'Jarvis',
  }
}
