import type { RefObject } from 'react'
import { Composer } from './Composer'
import { ComposeIcon, SearchIcon } from './icons'
import type { MicControls } from '../types'

export function EmptyState({
  input,
  onInputChange,
  onSend,
  isSending,
  textareaRef,
  onApplySuggestion,
  mic,
  pendingImage,
  onAttachImage,
  onRemoveImage,
}: {
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  isSending: boolean
  textareaRef: RefObject<HTMLTextAreaElement>
  onApplySuggestion: (starter: string) => void
  mic: MicControls
  pendingImage: string | undefined
  onAttachImage: (file: File) => void
  onRemoveImage: () => void
}) {
  return (
    <div className="empty-state">
      <p className="empty-heading">How can I help you today?</p>
      <Composer
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        isSending={isSending}
        textareaRef={textareaRef}
        mic={mic}
        pendingImage={pendingImage}
        onAttachImage={onAttachImage}
        onRemoveImage={onRemoveImage}
      />
      <div className="suggestion-chips">
        {/* Mapped to real Jarvis capabilities only — no "Search the web" chip
            since there's no web-search tool, unlike a literal ChatGPT clone. */}
        <button type="button" className="suggestion-chip" onClick={() => onApplySuggestion('Help me write ')}>
          <ComposeIcon />
          Write or edit
        </button>
        <button type="button" className="suggestion-chip" onClick={() => onApplySuggestion('Search my workspace files for ')}>
          <SearchIcon />
          Search my files
        </button>
      </div>
    </div>
  )
}
