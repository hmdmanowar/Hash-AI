const API_BASE = 'http://127.0.0.1:4000'

export interface JarvisInfo {
  assistantName: string
  model: string
}

export async function fetchInfo(): Promise<JarvisInfo> {
  const res = await fetch(`${API_BASE}/api/info`)
  if (!res.ok) throw new Error(`Could not reach Jarvis API (${res.status})`)
  return res.json()
}

export async function sendMessage(message: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  const data = (await res.json()) as { reply: string }
  return data.reply
}

export async function resetConversation(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`Could not reset conversation (${res.status})`)
}
