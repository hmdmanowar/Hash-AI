import { mkdirSync } from 'node:fs'
import type { Tool } from './Tool.js'
import { createFileSystemTools } from './FileSystemTools.js'
import { createSearchTool } from './SearchTool.js'
import { createTerminalTool } from './TerminalTool.js'

// Every concrete tool, keyed by name, plus the text block that gets
// injected into the system prompt so the model knows what's available and
// how to ask for it. Adding a new tool later means writing one factory
// function and listing it here — nothing else changes.
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  constructor(workspaceRoot: string) {
    // write_file creates its own parent dirs lazily, but read_file/
    // list_directory/search_code/run_command all assume the root itself
    // already exists — ensure that up front rather than failing on
    // whichever tool happens to run first.
    mkdirSync(workspaceRoot, { recursive: true })

    const allTools: Tool[] = [
      ...createFileSystemTools(workspaceRoot),
      createSearchTool(workspaceRoot),
      createTerminalTool(workspaceRoot),
    ]
    for (const tool of allTools) this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return [...this.tools.values()]
  }

  describeForPrompt(): string {
    return this.list()
      .map((tool) => `- ${tool.name}(${Object.keys(tool.inputSchema).join(', ')}): ${tool.description}`)
      .join('\n')
  }
}
