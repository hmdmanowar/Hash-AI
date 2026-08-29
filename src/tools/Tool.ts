// Contract only for v0.1 — no concrete tools (filesystem, terminal, browser,
// etc.) are implemented yet. That's Phase 3. Defining the shape now means
// the Agent Orchestrator and Permission Engine built in later phases can be
// designed against a stable interface from day one.
export interface ToolInputSchema {
  [paramName: string]: 'string' | 'number' | 'boolean'
}

export interface Tool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string
  description: string
  inputSchema: ToolInputSchema
  execute(input: TInput): Promise<TOutput>
}
