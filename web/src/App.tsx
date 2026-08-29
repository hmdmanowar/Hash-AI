import { useEffect, useRef, useState } from 'react'
import { fetchInfo, sendMessage, resetConversation, type JarvisInfo } from './api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function App() {
  const [info, setInfo] = useState<JarvisInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchInfo()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not reach Jarvis'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || isSending) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
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

  async function handleReset() {
    try {
      await resetConversation()
      setMessages([])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new conversation')
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{info?.assistantName ?? 'Jarvis'}</h1>
          {info && <span className="model-tag">{info.model}</span>}
        </div>
        <button type="button" onClick={handleReset} className="reset-button">
          New conversation
        </button>
      </header>

      <main className="messages">
        {messages.length === 0 && !error && <p className="empty-state">Say something to get started.</p>}
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <span className="bubble">{message.content}</span>
          </div>
        ))}
        {isSending && (
          <div className="message assistant">
            <span className="bubble typing">…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {error && <p className="error-banner">{error}</p>}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          handleSend()
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Message Jarvis…"
          autoFocus
        />
        <button type="submit" disabled={isSending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

export default App
