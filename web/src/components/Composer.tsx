import { useEffect, type RefObject } from 'react'
import { PlusIcon, ThinkIcon, MicIcon } from './icons'

export function Composer({
  input,
  onInputChange,
  onSend,
  isSending,
  textareaRef,
}: {
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  isSending: boolean
  textareaRef: RefObject<HTMLTextAreaElement>
}) {
  // Runs whenever `input` changes for any reason — typing, sending (clears
  // it), or a suggestion chip prefilling it — so the caller never needs to
  // separately remember to trigger a resize.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input, textareaRef])

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        onSend()
      }}
    >
      <div className="composer-bar">
        <button type="button" className="composer-icon-btn" disabled title="Attachments — coming soon" aria-label="Attachments (coming soon)">
          <PlusIcon />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSend()
            }
          }}
          placeholder="Ask anything"
          rows={1}
          autoFocus
        />
        <div className="composer-right">
          <button type="button" className="composer-pill-btn" disabled title="Extended reasoning — coming soon">
            <ThinkIcon />
            Think
          </button>
          <button type="button" className="composer-icon-btn" disabled title="Voice input — coming soon" aria-label="Voice input (coming soon)">
            <MicIcon />
          </button>
          <button type="submit" className="composer-send" disabled={isSending || !input.trim()} aria-label="Send">
            ↑
          </button>
        </div>
      </div>
    </form>
  )
}
