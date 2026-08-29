import { useEffect, useRef, useState } from 'react'
import {
  fetchInfo,
  sendMessage,
  resetConversation,
  listConversations,
  getConversationMessages,
  activateConversation,
  renameConversation,
  deleteConversation,
  type JarvisInfo,
  type ConversationSummary,
} from './api'
import type { Message } from './types'
import { useTheme } from './hooks/useTheme'
import { useSidebarCollapsed } from './hooks/useSidebarCollapsed'
import { Sidebar } from './components/Sidebar'
import { Composer } from './components/Composer'
import { EmptyState } from './components/EmptyState'
import { MessageList } from './components/MessageList'
import { ConfirmModal } from './components/ConfirmModal'

function App() {
  const [info, setInfo] = useState<JarvisInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { theme, toggle: toggleTheme } = useTheme()
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed()

  useEffect(() => {
    fetchInfo()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not reach Jarvis'))
    refreshConversations()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  function refreshConversations() {
    listConversations()
      .then(setConversations)
      .catch(() => {
        // Best-effort — a stale sidebar list isn't worth surfacing as an error.
      })
  }

  function applySuggestion(starter: string) {
    setInput(starter)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      el?.focus()
      el?.setSelectionRange(starter.length, starter.length)
    })
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isSending) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setIsSending(true)
    setError('')

    try {
      const { reply, conversationId } = await sendMessage(text)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      setActiveConversationId(conversationId)
      refreshConversations()
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
      setActiveConversationId(undefined)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new conversation')
    }
  }

  async function handleSelectConversation(id: string) {
    if (id === activeConversationId || isSending) return
    try {
      await activateConversation(id)
      const history = await getConversationMessages(id)
      setMessages(history)
      setActiveConversationId(id)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch conversation')
    }
  }

  async function handleRenameConversation(id: string, title: string) {
    try {
      await renameConversation(id, title)
      refreshConversations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename conversation')
    }
  }

  async function confirmDeleteConversation() {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await deleteConversation(id)
      if (id === activeConversationId) {
        setMessages([])
        setActiveConversationId(undefined)
      }
      refreshConversations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete conversation')
    }
  }

  const isEmptyConversation = messages.length === 0 && !error

  return (
    <div className="shell">
      <Sidebar
        info={info}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={setPendingDelete}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="conversation">
        {isEmptyConversation ? (
          <EmptyState
            input={input}
            onInputChange={setInput}
            onSend={handleSend}
            isSending={isSending}
            textareaRef={textareaRef}
            onApplySuggestion={applySuggestion}
          />
        ) : (
          <>
            <MessageList messages={messages} isSending={isSending} bottomRef={bottomRef} />
            {error && <p className="error-banner">{error}</p>}
            <Composer input={input} onInputChange={setInput} onSend={handleSend} isSending={isSending} textareaRef={textareaRef} />
          </>
        )}
      </main>

      {pendingDelete && (
        <ConfirmModal
          title="Delete conversation?"
          message={`"${pendingDelete.title}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteConversation}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

export default App
