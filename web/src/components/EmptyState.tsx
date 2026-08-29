import type { RefObject } from 'react'
import { Composer } from './Composer'
import { ComposeIcon, SearchIcon } from './icons'

export function EmptyState({
  input,
  onInputChange,
  onSend,
  isSending,
  textareaRef,
  onApplySuggestion,
}: {
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  isSending: boolean
  textareaRef: RefObject<HTMLTextAreaElement>
  onApplySuggestion: (starter: string) => void
}) {
  return (
    <div className="empty-state">
      <p className="empty-heading">How can I help you today?</p>
      <Composer input={input} onInputChange={onInputChange} onSend={onSend} isSending={isSending} textareaRef={textareaRef} />
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
