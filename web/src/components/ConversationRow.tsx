import { useState, type MouseEvent } from 'react'
import type { ConversationSummary } from '../api'

export function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary
  active: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)

  function startEditing(event: MouseEvent) {
    event.stopPropagation()
    setDraft(conversation.title)
    setIsEditing(true)
  }

  function commitEdit() {
    const title = draft.trim()
    setIsEditing(false)
    if (title && title !== conversation.title) onRename(title)
  }

  return (
    <div className={`conversation-item${active ? ' active' : ''}`} onClick={isEditing ? undefined : onSelect}>
      {isEditing ? (
        <input
          className="conversation-item-edit"
          value={draft}
          autoFocus
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEdit()
            if (event.key === 'Escape') setIsEditing(false)
          }}
        />
      ) : (
        <span className="conversation-item-title">{conversation.title}</span>
      )}
      <div className="conversation-item-actions" style={isEditing ? { visibility: 'hidden' } : undefined}>
        <button type="button" onClick={startEditing} aria-label="Rename conversation">
          ✎
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          aria-label="Delete conversation"
        >
          🗑
        </button>
      </div>
    </div>
  )
}
