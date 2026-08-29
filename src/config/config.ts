import 'dotenv/config'

export interface JarvisConfig {
  ollamaHost: string
  model: string
  // The persona name the assistant introduces itself as — kept separate
  // from the project/package name ("jarvis"), which never changes. This is
  // user-configurable now (env var) and intended to become runtime-renamable
  // once the system is further along (see Jarvis.setAssistantName).
  assistantName: string
  // Port for the local HTTP API (src/api/server.ts). Only ever bound to
  // 127.0.0.1 — there's no auth yet, so this must never be exposed on the
  // network.
  apiPort: number
  // Where persistent long-term memory lives (see memory/LongTermMemory.ts).
  // Relative to wherever the process is started from.
  memoryDbPath: string
  // Phase 3: the sandbox root every file/terminal tool is confined to (see
  // tools/sandbox.ts) — never anywhere outside this directory, regardless
  // of what path the model asks for.
  workspaceRoot: string
  // Append-only audit log of every tool action taken (see
  // permissions/PermissionEngine.ts).
  auditLogPath: string
}

export function loadConfig(): JarvisConfig {
  return {
    ollamaHost: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
    model: process.env.JARVIS_MODEL ?? 'qwen2.5-coder',
    assistantName: process.env.JARVIS_NAME ?? 'Jarvis',
    apiPort: Number(process.env.JARVIS_API_PORT ?? 4000),
    memoryDbPath: process.env.JARVIS_MEMORY_DB ?? '.jarvis/memory.sqlite',
    workspaceRoot: process.env.JARVIS_WORKSPACE_ROOT ?? '.jarvis/workspace',
    auditLogPath: process.env.JARVIS_AUDIT_LOG ?? '.jarvis/audit.log',
  }
}
