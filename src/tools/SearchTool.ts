import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Tool } from './Tool.js'
import { resolveSandboxedPath } from './sandbox.js'

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist'])
const MAX_RESULTS = 50

async function walk(dir: string, root: string, query: string, matches: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (matches.length >= MAX_RESULTS) return
    if (IGNORED_DIRS.has(entry.name)) continue

    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath, root, query, matches)
      continue
    }
    if (!entry.isFile()) continue

    let content: string
    try {
      content = await readFile(fullPath, 'utf8')
    } catch {
      continue // Binary or unreadable — skip it.
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length && matches.length < MAX_RESULTS; i++) {
      if (lines[i].toLowerCase().includes(query.toLowerCase())) {
        matches.push(`${relative(root, fullPath)}:${i + 1}: ${lines[i].trim()}`)
      }
    }
  }
}

// Plain recursive text search — no dependency, capped at MAX_RESULTS so a
// broad query on a large workspace can't blow up the response.
export function createSearchTool(workspaceRoot: string): Tool<{ query: string }, { matches: string[] }> {
  return {
    name: 'search_code',
    description: 'Search for a text string across every file in the sandboxed workspace. Returns matching lines with file:line references.',
    inputSchema: { query: 'string' },
    risk: 'low',
    async execute({ query }) {
      const root = resolveSandboxedPath(workspaceRoot, '.')
      const matches: string[] = []
      await walk(root, root, query, matches)
      return { matches }
    },
  }
}
