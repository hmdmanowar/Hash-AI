import http from 'node:http'
import { loadConfig } from '../config/config.js'
import { OllamaModel } from '../models/OllamaModel.js'
import { LongTermMemory } from '../memory/LongTermMemory.js'
import { ConversationStore } from '../memory/ConversationStore.js'
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
  // Phase 5: a separate multimodal model, used only for a turn that
  // attaches an image — see core/Jarvis.ts.
  visionModel: new OllamaModel(config.ollamaHost, config.visionModel),
})
const conversationStore = new ConversationStore(config.conversationsDbPath)

// No multipart upload here — images arrive inline as base64 in the JSON
// body, so a generous but bounded cap keeps one oversized photo from
// blowing up memory/DB size. ~8MB decoded, which is roughly this many
// base64 characters (base64 is ~4/3 the size of the original bytes).
const MAX_IMAGE_BASE64_LENGTH = 11_000_000

// Which persisted conversation the single Jarvis instance's short-term
// memory currently reflects — unset until the first message is sent (or
// after /api/reset). This server assumes one local user in one browser tab;
// it doesn't track sessions, so two tabs open at once would fight over this
// same "current conversation" rather than getting independent ones.
let currentConversationId: string | undefined

function autoTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
}

function send(res: http.ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname

  try {
    if (req.method === 'GET' && pathname === '/api/info') {
      send(res, 200, { assistantName: jarvis.getAssistantName(), model: config.model })
      return
    }

    if (req.method === 'GET' && pathname === '/api/conversations') {
      send(res, 200, conversationStore.listConversations())
      return
    }

    const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/)
    if (req.method === 'GET' && messagesMatch) {
      send(res, 200, conversationStore.getMessages(messagesMatch[1]))
      return
    }

    const activateMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/activate$/)
    if (req.method === 'POST' && activateMatch) {
      if (jarvis.hasPendingToolCall()) {
        send(res, 409, { error: 'Resolve the pending action (/approve or /deny) before switching conversations.' })
        return
      }
      const id = activateMatch[1]
      jarvis.loadHistory(conversationStore.getMessages(id))
      currentConversationId = id
      send(res, 204)
      return
    }

    const truncateMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/truncate$/)
    if (req.method === 'POST' && truncateMatch) {
      const id = truncateMatch[1]
      if (id === currentConversationId && jarvis.hasPendingToolCall()) {
        send(res, 409, { error: 'Resolve the pending action (/approve or /deny) before editing a message.' })
        return
      }
      const body = (await readJsonBody(req)) as { keepCount?: unknown }
      if (typeof body.keepCount !== 'number' || body.keepCount < 0) {
        send(res, 400, { error: 'Request body must include a non-negative "keepCount" number' })
        return
      }
      conversationStore.truncate(id, body.keepCount)
      if (id === currentConversationId) {
        jarvis.loadHistory(conversationStore.getMessages(id))
      }
      send(res, 204)
      return
    }

    const conversationMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/)
    if (req.method === 'PATCH' && conversationMatch) {
      const body = (await readJsonBody(req)) as { title?: unknown }
      if (typeof body.title !== 'string' || !body.title.trim()) {
        send(res, 400, { error: 'Request body must include a non-empty "title" string' })
        return
      }
      const renamed = conversationStore.renameConversation(conversationMatch[1], body.title.trim())
      send(res, renamed ? 204 : 404, renamed ? undefined : { error: 'Conversation not found' })
      return
    }

    if (req.method === 'DELETE' && conversationMatch) {
      const id = conversationMatch[1]
      const deleted = conversationStore.deleteConversation(id)
      if (!deleted) {
        send(res, 404, { error: 'Conversation not found' })
        return
      }
      if (id === currentConversationId) {
        jarvis.reset()
        currentConversationId = undefined
      }
      send(res, 204)
      return
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const body = (await readJsonBody(req)) as { message?: unknown; images?: unknown }
      if (typeof body.message !== 'string' || !body.message.trim()) {
        send(res, 400, { error: 'Request body must include a non-empty "message" string' })
        return
      }
      let images: string[] | undefined
      if (body.images !== undefined) {
        if (!Array.isArray(body.images) || !body.images.every((img) => typeof img === 'string' && img.length > 0)) {
          send(res, 400, { error: 'Request body\'s "images" must be an array of non-empty base64 strings' })
          return
        }
        if (body.images.some((img) => img.length > MAX_IMAGE_BASE64_LENGTH)) {
          send(res, 400, { error: 'One of the attached images is too large (max ~8MB each)' })
          return
        }
        images = body.images
      }

      if (!currentConversationId) {
        currentConversationId = conversationStore.createConversation(autoTitle(body.message)).id
      }
      conversationStore.appendMessage(currentConversationId, { role: 'user', content: body.message, images })
      const reply = await jarvis.handleInput(body.message, images)
      conversationStore.appendMessage(currentConversationId, { role: 'assistant', content: reply })
      send(res, 200, { reply, conversationId: currentConversationId })
      return
    }

    if (req.method === 'POST' && pathname === '/api/reset') {
      jarvis.reset()
      currentConversationId = undefined
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
