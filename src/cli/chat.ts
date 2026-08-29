import readline from 'node:readline'
import { readFileSync, statSync } from 'node:fs'
import { loadConfig } from '../config/config.js'
import { OllamaModel } from '../models/OllamaModel.js'
import { LongTermMemory } from '../memory/LongTermMemory.js'
import { ToolRegistry } from '../tools/registry.js'
import { PermissionEngine } from '../permissions/PermissionEngine.js'
import { Jarvis } from '../core/Jarvis.js'

// Matches the API's ~8MB decoded cap (server.ts) — no multipart upload
// here either, so a size guard keeps a huge file from stalling the CLI.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

async function main() {
  const config = loadConfig()
  const jarvis = new Jarvis(new OllamaModel(config.ollamaHost, config.model), {
    assistantName: config.assistantName,
    longTermMemory: new LongTermMemory(config.memoryDbPath),
    toolRegistry: new ToolRegistry(config.workspaceRoot),
    permissionEngine: new PermissionEngine(config.auditLogPath),
    maxAgentSteps: config.maxAgentSteps,
    visionModel: new OllamaModel(config.ollamaHost, config.visionModel),
  })
  const label = jarvis.getAssistantName().toLowerCase()

  console.log(`${jarvis.getAssistantName()} v0.1 — model: ${config.model} (${config.ollamaHost})`)
  console.log(`Sandboxed workspace: ${config.workspaceRoot}`)
  console.log("Type a message and press Enter. Ctrl+C to quit.")
  console.log("Commands: /remember <text>, /memories, /forget <id>, /approve, /deny, /image <path>\n")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' })
  rl.prompt()

  // Attached via /image, consumed by the next real message sent — cleared
  // afterward either way so it can't silently re-attach to a later turn.
  let pendingImage: string | undefined

  let queue: Promise<void> = Promise.resolve()

  rl.on('line', (line) => {
    queue = queue.then(async () => {
      const input = line.trim()
      if (!input) {
        rl.prompt()
        return
      }

      const imageMatch = input.match(/^\/image\s+(.+)$/i)
      if (imageMatch) {
        const path = imageMatch[1].trim()
        try {
          const size = statSync(path).size
          if (size > MAX_IMAGE_BYTES) {
            console.log(`${label}> That image is too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB).\n`)
          } else {
            pendingImage = readFileSync(path).toString('base64')
            console.log(`${label}> Got it — I'll look at that image with your next message.\n`)
          }
        } catch (error) {
          console.log(`${label}> Couldn't read that file: ${error instanceof Error ? error.message : String(error)}\n`)
        }
        rl.prompt()
        return
      }

      const images = pendingImage ? [pendingImage] : undefined
      pendingImage = undefined
      try {
        const reply = await jarvis.handleInput(input, images)
        console.log(`${label}> ${reply}\n`)
      } catch (error) {
        console.error(`error> ${error instanceof Error ? error.message : String(error)}\n`)
      }
      rl.prompt()
    })
  })
}

main()
