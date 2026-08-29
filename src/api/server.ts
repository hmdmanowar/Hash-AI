import http from 'node:http'
import { loadConfig } from '../config/config.js'
import { OllamaModel } from '../models/OllamaModel.js'
import { LongTermMemory } from '../memory/LongTermMemory.js'
import { ToolRegistry } from '../tools/registry.js'
import { PermissionEngine } from '../permissions/PermissionEngine.js'
import { Jarvis } from '../core/Jarvis.js'

// A plain node:http server — no framework dependency, matching the
// roadmap's own tech direction ("Node HTTP API; streaming later"). This is
// a local personal-assistant tool with no authentication yet, so it must
// only ever bind to 127.0.0.1, never 0.0.0.0 — never expose this on a
// network. That matters more now than it did before Phase 3: this process
// can execute shell commands and write files (sandboxed, and gated by
// PermissionEngine) — reachability from anywhere but localhost is not okay.
const config = loadConfig()
const jarvis = new Jarvis(new OllamaModel(config.ollamaHost, config.model), {
  assistantName: config.assistantName,
  longTermMemory: new LongTermMemory(config.memoryDbPath),
  toolRegistry: new ToolRegistry(config.workspaceRoot),
  permissionEngine: new PermissionEngine(config.auditLogPath),
  maxAgentSteps: config.maxAgentSteps,
})

function send(res: http.ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204)
    return
  }

  try {
    if (req.method === 'GET' && req.url === '/api/info') {
      send(res, 200, { assistantName: jarvis.getAssistantName(), model: config.model })
      return
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = (await readJsonBody(req)) as { message?: unknown }
      if (typeof body.message !== 'string' || !body.message.trim()) {
        send(res, 400, { error: 'Request body must include a non-empty "message" string' })
        return
      }
      const reply = await jarvis.handleInput(body.message)
      send(res, 200, { reply })
      return
    }

    if (req.method === 'POST' && req.url === '/api/reset') {
      jarvis.reset()
      send(res, 204)
      return
    }

    send(res, 404, { error: 'Not found' })
  } catch (error) {
    console.error(error)
    send(res, 500, { error: error instanceof Error ? error.message : 'Internal server error' })
  }
})

server.listen(config.apiPort, '127.0.0.1', () => {
  console.log(`Jarvis API listening on http://127.0.0.1:${config.apiPort}`)
})
