import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Tool } from './Tool.js'
import { resolveSandboxedPath } from './sandbox.js'

// All three tools are sandboxed to `workspaceRoot` via resolveSandboxedPath
// — read_file/list_directory are low-risk (read-only), write_file is
// medium (it mutates state, but only inside the sandbox, and every call is
// audit-logged by the Permission Engine regardless of risk level).
export function createFileSystemTools(workspaceRoot: string): Tool[] {
  const readFileTool: Tool<{ path: string }, { content: string }> = {
    name: 'read_file',
    description: 'Read the contents of a text file inside the sandboxed workspace.',
    inputSchema: { path: 'string' },
    risk: 'low',
    async execute({ path }) {
      const target = resolveSandboxedPath(workspaceRoot, path)
      const content = await readFile(target, 'utf8')
      return { content }
    },
  }

  const listDirectoryTool: Tool<{ path?: string }, { entries: string[] }> = {
    name: 'list_directory',
    description: 'List the files and folders inside a directory in the sandboxed workspace. Omit path for the workspace root.',
    inputSchema: { path: 'string' },
    risk: 'low',
    async execute({ path }) {
      const target = resolveSandboxedPath(workspaceRoot, path ?? '.')
      const entries = await readdir(target)
      return { entries }
    },
  }

  const writeFileTool: Tool<{ path: string; content: string }, { bytesWritten: number }> = {
    name: 'write_file',
    description: 'Create or overwrite a text file inside the sandboxed workspace, creating parent folders as needed.',
    inputSchema: { path: 'string', content: 'string' },
    risk: 'medium',
    async execute({ path, content }) {
      const target = resolveSandboxedPath(workspaceRoot, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
      return { bytesWritten: Buffer.byteLength(content, 'utf8') }
    },
  }

  return [readFileTool, listDirectoryTool, writeFileTool]
}
