import readline from 'node:readline'
import { loadConfig } from '../config/config.js'
import { OllamaModel } from '../models/OllamaModel.js'
import { Jarvis } from '../core/Jarvis.js'

async function main() {
  const config = loadConfig()
  const jarvis = new Jarvis(new OllamaModel(config.ollamaHost, config.model), {
    assistantName: config.assistantName,
  })
  const label = jarvis.getAssistantName().toLowerCase()

  console.log(`${jarvis.getAssistantName()} v0.1 — model: ${config.model} (${config.ollamaHost})`)
  console.log("Type a message and press Enter. Ctrl+C to quit.\n")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' })
  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }
    try {
      const reply = await jarvis.chat(input)
      console.log(`${label}> ${reply}\n`)
    } catch (error) {
      console.error(`error> ${error instanceof Error ? error.message : String(error)}\n`)
    }
    rl.prompt()
  })
}

main()
