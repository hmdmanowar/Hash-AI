import { useEffect, useRef, useState } from 'react'
import { fetchInfo, sendMessage, resetConversation, type JarvisInfo } from './api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type ContentSegment = { type: 'text'; text: string } | { type: 'code'; lang: string; code: string }

// Splits on fenced ```lang\ncode``` blocks so code can get its own
// monospace block with a copy button, instead of dumping everything as one
// plain-text blob — the single highest-value bit of "message formatting"
// for a coding-focused model, without pulling in a full markdown/highlight
// dependency chain for a local personal tool.
function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content))) {
    if (match.index > lastIndex) segments.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    segments.push({ type: 'code', lang: match[1] || 'text', code: match[2].replace(/\n$/, '') })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < content.length) segments.push({ type: 'text', text: content.slice(lastIndex) })
  return segments
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be blocked — nothing to fall back to here.
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{lang}</span>
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function MessageBody({ content }: { content: string }) {
  const segments = parseContent(content)
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === 'code' ? (
          <CodeBlock key={index} lang={segment.lang} code={segment.code} />
        ) : (
          <p key={index}>{segment.text.trim()}</p>
        ),
      )}
    </>
  )
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }
}

function App() {
  const [info, setInfo] = useState<JarvisInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { theme, toggle: toggleTheme } = useTheme()

  useEffect(() => {
    fetchInfo()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not reach Jarvis'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isSending) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    requestAnimationFrame(autoResize)
    setIsSending(true)
    setError('')

    try {
      const reply = await sendMessage(text)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSending(false)
    }
  }

  async function handleNewChat() {
    try {
      await resetConversation()
      setMessages([])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new conversation')
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="" />
          <span className="brand-name">{info?.assistantName ?? 'Hash AI'}</span>
        </div>
        <button type="button" className="new-chat" onClick={handleNewChat}>
          + New chat
        </button>
        <div className="sidebar-footer">
          {info && <span className="model-tag">{info.model}</span>}
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </aside>

      <main className="conversation">
        <div className="scroll-area">
          {messages.length === 0 && !error && (
            <div className="empty-state">
              <img className="empty-mark" src="/logo.png" alt="" />
              <p>How can I help you today?</p>
            </div>
          )}

          {messages.map((message, index) =>
            message.role === 'user' ? (
              <div key={index} className="row user-row">
                <div className="user-bubble">{message.content}</div>
              </div>
            ) : (
              <div key={index} className="row assistant-row">
                <img className="avatar" src="/logo.png" alt="" />
                <div className="assistant-content">
                  <MessageBody content={message.content} />
                </div>
              </div>
            ),
          )}

          {isSending && (
            <div className="row assistant-row">
              <img className="avatar" src="/logo.png" alt="" />
              <div className="assistant-content">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && <p className="error-banner">{error}</p>}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            handleSend()
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              autoResize()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder={`Message ${info?.assistantName ?? 'Jarvis'}…`}
            rows={1}
            autoFocus
          />
          <button type="submit" disabled={isSending || !input.trim()} aria-label="Send">
            ↑
          </button>
        </form>
      </main>
    </div>
  )
}

export default App
