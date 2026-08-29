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
  truncateConversation,
  type JarvisInfo,
  type ConversationSummary,
} from './api'
import type { Message } from './types'
import { isGoodbye, downscaleImage } from './utils'
import { matchCommand, type AppCommand } from './commands'
import { useTheme } from './hooks/useTheme'
import { useSidebarCollapsed } from './hooks/useSidebarCollapsed'
import { useAutoSpeak } from './hooks/useAutoSpeak'
import { usePersistentToggle } from './hooks/usePersistentToggle'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useWakeWord } from './hooks/useWakeWord'
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
  const [pendingImage, setPendingImage] = useState<string | undefined>(undefined)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { theme, toggle: toggleTheme } = useTheme()
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed()
  const { enabled: autoSpeakEnabled, toggle: toggleAutoSpeak } = useAutoSpeak()
  const { value: wakeWordEnabled, setValue: setWakeWordEnabled, toggle: toggleWakeWord } = usePersistentToggle('jarvis-wake-word')
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Whatever was already typed before the mic was pressed — live speech
  // appends after it instead of overwriting it. Reset to empty whenever the
  // wake word triggers listening, since that always starts a fresh command.
  const micBaseTextRef = useRef('')
  const inputRef = useRef(input)
  inputRef.current = input

  const {
    isSupported: micSupported,
    isListening: isMicListening,
    start: startMic,
    stop: stopMic,
  } = useSpeechRecognition(
    (transcript) => {
      const base = micBaseTextRef.current
      setInput(base ? `${base} ${transcript}` : transcript)
    },
    () => {
      // A real pause in speech (not the mic being clicked to cancel) —
      // submit what was transcribed automatically, marked as a voice turn
      // so the conversation keeps listening after the reply — unless it's
      // a goodbye, which still gets sent normally but ends the hands-free
      // session, handing control back to the wake word.
      const text = inputRef.current.trim()
      if (text) handleSend(!isGoodbye(text))
    },
  )

  function toggleMic() {
    if (isMicListening) {
      stopMic()
      return
    }
    micBaseTextRef.current = input.trim()
    startMic()
  }

  // Reads a reply aloud and tracks when it starts/stops — unlike the
  // fire-and-forget speak() used by the per-message Listen button, auto-speak
  // needs to know when it's done so wake-word listening (below) and the
  // continue-the-conversation resume (in sendText) know it's safe to
  // proceed without picking up Jarvis's own voice. onDone always fires,
  // even if speech synthesis isn't available, so callers don't need a
  // separate fallback path.
  function speakReply(text: string, onDone?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onDone?.()
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      onDone?.()
    }
    utterance.onerror = () => {
      setIsSpeaking(false)
      onDone?.()
    }
    window.speechSynthesis.speak(utterance)
  }

  // Only actually listens for the wake phrase when nothing else is using
  // the mic/speakers — avoids fighting with active command capture and
  // reduces the chance of hearing Jarvis's own auto-spoken reply.
  const wakeWordActive = wakeWordEnabled && micSupported && !isMicListening && !isSpeaking && !isSending
  const { permissionDenied: wakeWordPermissionDenied } = useWakeWord(`hey ${(info?.assistantName ?? 'jarvis').toLowerCase()}`, wakeWordActive, () => {
    micBaseTextRef.current = ''
    startMic()
  })

  // Lets you barge in on Jarvis mid-reply by saying "stop" — only listens
  // for it while actually speaking, so it can never fire otherwise. Reuses
  // the same continuous-listening mechanism as the wake word, just with a
  // different phrase and trigger condition.
  useWakeWord('stop', micSupported && isSpeaking, () => {
    window.speechSynthesis.cancel()
    micBaseTextRef.current = ''
    startMic()
  })

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

  async function handleAttachImage(file: File) {
    try {
      const base64 = await downscaleImage(file)
      setPendingImage(base64)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach that image')
    }
  }

  // fromVoice marks a turn that was itself started by speaking (the mic
  // button or the wake word), as opposed to typing — only those turns
  // resume listening afterward, so a hands-free conversation keeps going
  // turn after turn, but typing a message never unexpectedly turns the mic
  // back on.
  async function sendText(text: string, fromVoice = false, images?: string[]) {
    if (!text || isSending) return

    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString(), images }])
    setIsSending(true)
    setError('')

    try {
      const { reply, conversationId } = await sendMessage(text, images)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }])
      setActiveConversationId(conversationId)
      refreshConversations()
      if (autoSpeakEnabled) {
        speakReply(reply, () => {
          if (fromVoice) startMic()
        })
      } else if (fromVoice) {
        startMic()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSending(false)
    }
  }

  async function handleSend(fromVoice = false) {
    const trimmed = input.trim()
    if ((!trimmed && !pendingImage) || isSending) return
    // A default caption when an image is sent with no text of its own —
    // the backend requires a non-empty message either way.
    const text = trimmed || 'Describe this image.'

    const command = matchCommand(text)
    if (command) {
      setInput('')
      runCommand(command)
      return
    }

    setInput('')
    const images = pendingImage ? [pendingImage] : undefined
    setPendingImage(undefined)
    await sendText(text, fromVoice, images)
  }

  // Recognized app commands (see commands.ts) act on the UI directly and
  // never reach the model or the chat transcript at all.
  function runCommand(command: AppCommand) {
    switch (command.type) {
      case 'new-chat':
        handleNewChat()
        break
      case 'delete-conversation': {
        const active = conversations.find((c) => c.id === activeConversationId)
        if (active) setPendingDelete(active)
        break
      }
      case 'enable-voice-assistant':
        setWakeWordEnabled(true)
        break
      case 'disable-voice-assistant':
        setWakeWordEnabled(false)
        stopMic()
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
        setIsSpeaking(false)
        break
    }
  }

  // Editing a past message drops it and everything after it (now stale),
  // both locally and in the persisted conversation, then resends the edited
  // text as a fresh message right after — same as every mainstream chat
  // app's "edit and regenerate" behavior.
  async function handleEditMessage(index: number, newText: string) {
    if (!activeConversationId || isSending) return
    try {
      await truncateConversation(activeConversationId, index)
      setMessages((prev) => prev.slice(0, index))
      await sendText(newText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message')
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
      setMessages(history.map((m) => ({ role: m.role, content: m.content, timestamp: m.createdAt, images: m.images })))
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
  const mic = { isSupported: micSupported, isListening: isMicListening, toggle: toggleMic }

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
        autoSpeakEnabled={autoSpeakEnabled}
        onToggleAutoSpeak={toggleAutoSpeak}
        wakeWordEnabled={wakeWordEnabled}
        onToggleWakeWord={toggleWakeWord}
        wakeWordSupported={micSupported}
        wakeWordPermissionDenied={wakeWordPermissionDenied}
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
            mic={mic}
            pendingImage={pendingImage}
            onAttachImage={handleAttachImage}
            onRemoveImage={() => setPendingImage(undefined)}
          />
        ) : (
          <>
            <MessageList messages={messages} isSending={isSending} bottomRef={bottomRef} onEditMessage={handleEditMessage} />
            {error && <p className="error-banner">{error}</p>}
            <Composer
              input={input}
              onInputChange={setInput}
              onSend={handleSend}
              isSending={isSending}
              textareaRef={textareaRef}
              mic={mic}
              pendingImage={pendingImage}
              onAttachImage={handleAttachImage}
              onRemoveImage={() => setPendingImage(undefined)}
            />
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
