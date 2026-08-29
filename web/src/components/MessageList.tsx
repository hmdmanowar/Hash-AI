import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Message } from '../types'
import { formatTimestamp, toImageSrc } from '../utils'
import { MessageBody } from './MessageBody'
import { MessageActions } from './MessageActions'

function MessageImages({ images, onView }: { images: string[]; onView: (base64: string) => void }) {
  return (
    <div className="message-images">
      {images.map((base64, index) => (
        <img key={index} src={toImageSrc(base64)} alt="Attached" onClick={() => onView(base64)} />
      ))}
    </div>
  )
}

function EditableUserBubble({
  content,
  onSave,
  onCancel,
}: {
  content: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // Focus without the browser's default scroll-into-view — for a long
  // pasted message the box can be tall, and the default behavior was
  // jumping the whole page to align its top with the viewport, which read
  // as "scrolled to the top" rather than a normal in-place focus.
  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  function commit() {
    const text = draft.trim()
    if (text) onSave(text)
    else onCancel()
  }

  return (
    <div className="user-bubble user-bubble-edit">
      <textarea
        ref={textareaRef}
        value={draft}
        rows={1}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') onCancel()
        }}
      />
      <div className="user-bubble-edit-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={commit}>
          Save & submit
        </button>
      </div>
    </div>
  )
}

export function MessageList({
  messages,
  isSending,
  bottomRef,
  onEditMessage,
}: {
  messages: Message[]
  isSending: boolean
  bottomRef: RefObject<HTMLDivElement>
  onEditMessage: (index: number, newText: string) => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  // Leaving a message mid-edit and switching conversations (or starting a
  // new chat) swaps the whole `messages` array out from under this
  // component without ever calling onSave/onCancel — without this, the
  // leftover editingIndex would make some unrelated message in the newly
  // loaded conversation render as "being edited" just because it happens
  // to share that index.
  useEffect(() => {
    setEditingIndex(null)
  }, [messages])

  return (
    <div className="scroll-area">
      {messages.map((message, index) => (
        <div key={index}>
          {message.role === 'user' && <div className="message-timestamp">{formatTimestamp(message.timestamp)}</div>}
          {message.role === 'user' ? (
            <div className="row user-row">
              <div className="message-block">
                {editingIndex === index ? (
                  <EditableUserBubble
                    content={message.content}
                    onCancel={() => setEditingIndex(null)}
                    onSave={(text) => {
                      setEditingIndex(null)
                      onEditMessage(index, text)
                    }}
                  />
                ) : (
                  <>
                    {message.images && message.images.length > 0 && (
                      <MessageImages images={message.images} onView={setViewingImage} />
                    )}
                    <div className="user-bubble">{message.content}</div>
                    <MessageActions content={message.content} onEdit={() => setEditingIndex(index)} />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="row assistant-row">
              <img className="avatar" src="/logo.png" alt="" />
              <div className="assistant-content">
                <MessageBody content={message.content} />
                <MessageActions content={message.content} />
              </div>
            </div>
          )}
        </div>
      ))}

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

      {viewingImage && (
        <div className="image-viewer-backdrop" onClick={() => setViewingImage(null)}>
          <img src={toImageSrc(viewingImage)} alt="Attached, full size" />
        </div>
      )}
    </div>
  )
}
