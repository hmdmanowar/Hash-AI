import readline from 'node:readline'
import { loadConfig } from '../config/config.js'
import { OllamaModel } from '../models/OllamaModel.js'
import { LongTermMemory } from '../memory/LongTermMemory.js'
import { ToolRegistry } from '../tools/registry.js'
import { PermissionEngine } from '../permissions/PermissionEngine.js'
import { Jarvis } from '../core/Jarvis.js'

async function main() {
  const config = loadConfig()
  const jarvis = new Jarvis(new OllamaModel(config.ollamaHost, config.model), {
    assistantName: config.assistantName,
    longTermMemory: new LongTermMemory(config.memoryDbPath),
    toolRegistry: new ToolRegistry(config.workspaceRoot),
    permissionEngine: new PermissionEngine(config.auditLogPath),
    maxAgentSteps: config.maxAgentSteps,
  })
  const label = jarvis.getAssistantName().toLowerCase()

  console.log(`${jarvis.getAssistantName()} v0.1 — model: ${config.model} (${config.ollamaHost})`)
  console.log(`Sandboxed workspace: ${config.workspaceRoot}`)
  console.log("Type a message and press Enter. Ctrl+C to quit.")
  console.log("Commands: /remember <text>, /memories, /forget <id>, /approve, /deny\n")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' })
  rl.prompt()

  // readline fires 'line' for every input line as soon as it's available —
  // for piped/fast input that can mean several lines arrive before the
  // first async handleInput() call finishes. Without serializing them, two
  // calls interleave against the same Jarvis instance (same conversation
  // history, same pendingToolCall), corrupting both. Chaining onto a single
  // promise forces one line to fully finish before the next one starts,
  // regardless of how fast 'line' events arrive.
  let queue: Promise<void> = Promise.resolve()

  rl.on('line', (line) => {
    queue = queue.then(async () => {
      const input = line.trim()
      if (!input) {
        rl.prompt()
        return
      }
      try {
        const reply = await jarvis.handleInput(input)
        console.log(`${label}> ${reply}\n`)
      } catch (error) {
        console.error(`error> ${error instanceof Error ? error.message : String(error)}\n`)
      }
      rl.prompt()
    })
  })
}

main()
