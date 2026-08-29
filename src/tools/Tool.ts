import type { RiskLevel } from '../permissions/PermissionEngine.js'

export interface ToolInputSchema {
  [paramName: string]: 'string' | 'number' | 'boolean'
}

// Phase 3: real, concrete tools live in this directory (FileSystemTools.ts,
// SearchTool.ts, TerminalTool.ts), registered in registry.ts. Each tool
// declares its own fixed `risk` — the single source of truth the Permission
// Engine reads from, rather than a separate mapping that could drift out of
// sync with what a tool actually does.
export interface Tool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string
  description: string
  inputSchema: ToolInputSchema
  risk: RiskLevel
  execute(input: TInput): Promise<TOutput>
}
