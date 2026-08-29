import { spawn } from 'node:child_process'
import type { Tool } from './Tool.js'

const TIMEOUT_MS = 15_000
const MAX_OUTPUT_CHARS = 4000

interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

// The one high-risk tool — arbitrary shell execution. Always requires
// human approval (see PermissionEngine's risk policy); never auto-runs
// regardless of the command. Confined to workspaceRoot as its cwd and
// hard-capped at TIMEOUT_MS so a runaway or interactive command can't hang
// the process indefinitely.
export function createTerminalTool(workspaceRoot: string): Tool<{ command: string }, CommandResult> {
  return {
    name: 'run_command',
    description: 'Run a shell command inside the sandboxed workspace directory. Always requires human approval.',
    inputSchema: { command: 'string' },
    risk: 'high',
    execute({ command }) {
      return new Promise<CommandResult>((resolvePromise, reject) => {
        const child = spawn(command, {
          cwd: workspaceRoot,
          shell: true,
          timeout: TIMEOUT_MS,
        })

        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })

        child.on('error', reject)
        child.on('close', (code, signal) => {
          if (signal === 'SIGTERM') {
            reject(new Error(`Command timed out after ${TIMEOUT_MS}ms`))
            return
          }
          resolvePromise({
            exitCode: code,
            stdout: stdout.slice(0, MAX_OUTPUT_CHARS),
            stderr: stderr.slice(0, MAX_OUTPUT_CHARS),
          })
        })
      })
    },
  }
}
