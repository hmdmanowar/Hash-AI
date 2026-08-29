const API_BASE = 'http://127.0.0.1:4000'

export interface JarvisInfo {
  assistantName: string
  model: string
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

async function errorFromResponse(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({ error: fallback }))
  return new Error(body.error ?? fallback)
}

export async function fetchInfo(): Promise<JarvisInfo> {
  const res = await fetch(`${API_BASE}/api/info`)
  if (!res.ok) throw new Error(`Could not reach Jarvis API (${res.status})`)
  return res.json()
}

export async function sendMessage(message: string): Promise<{ reply: string; conversationId: string }> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw await errorFromResponse(res, `Request failed (${res.status})`)
  return res.json()
}

export async function resetConversation(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`Could not reset conversation (${res.status})`)
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_BASE}/api/conversations`)
  if (!res.ok) throw new Error(`Could not list conversations (${res.status})`)
  return res.json()
}

export async function getConversationMessages(id: string): Promise<ConversationMessage[]> {
  const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}/messages`)
  if (!res.ok) throw new Error(`Could not load conversation (${res.status})`)
  return res.json()
}

export async function activateConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}/activate`, { method: 'POST' })
  if (!res.ok) throw await errorFromResponse(res, `Could not switch conversation (${res.status})`)
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw await errorFromResponse(res, `Could not rename conversation (${res.status})`)
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw await errorFromResponse(res, `Could not delete conversation (${res.status})`)
}
