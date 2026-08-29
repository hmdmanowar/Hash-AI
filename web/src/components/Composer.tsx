import { useEffect, useRef, useState, type RefObject } from 'react'
import { PlusIcon, ThinkIcon, MicIcon, ImageIcon, AttachIcon } from './icons'
import type { MicControls } from '../types'
import { toImageSrc } from '../utils'

export function Composer({
  input,
  onInputChange,
  onSend,
  isSending,
  textareaRef,
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
  mic: MicControls
  pendingImage: string | undefined
  onAttachImage: (file: File) => void
  onRemoveImage: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Runs whenever `input` changes for any reason — typing, sending (clears
  // it), or a suggestion chip prefilling it — so the caller never needs to
  // separately remember to trigger a resize.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input, textareaRef])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        onSend()
      }}
    >
      {pendingImage && (
        <div className="composer-attachment">
          <img src={toImageSrc(pendingImage)} alt="Attached" />
          <button type="button" onClick={onRemoveImage} aria-label="Remove attached image">
            ×
          </button>
        </div>
      )}
      <div className="composer-bar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onAttachImage(file)
            event.target.value = ''
          }}
        />
        <div className="composer-attach-menu" ref={menuRef}>
          <button
            type="button"
            className="composer-icon-btn"
            onClick={() => setMenuOpen((open) => !open)}
            title="Add"
            aria-label="Add"
            aria-expanded={menuOpen}
          >
            <PlusIcon />
          </button>
          {menuOpen && (
            <div className="attach-menu-popover">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                <ImageIcon />
                <span>
                  <strong>Add photos</strong>
                  <small>Upload from your computer</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                <AttachIcon />
                <span>
                  <strong>Attach Files</strong>
                  <small>Upload from your computer</small>
                </span>
              </button>
            </div>
          )}
        </div>
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
          placeholder={mic.isListening ? 'Listening…' : 'Ask anything'}
          rows={1}
          autoFocus
        />
        <div className="composer-right">
          <button type="button" className="composer-pill-btn" disabled title="Extended reasoning — coming soon">
            <ThinkIcon />
            Think
          </button>
          <button
            type="button"
            className={`composer-icon-btn${mic.isListening ? ' listening' : ''}`}
            onClick={mic.toggle}
            disabled={!mic.isSupported}
            title={mic.isSupported ? (mic.isListening ? 'Stop listening' : 'Voice input') : 'Voice input is not supported in this browser'}
            aria-label={mic.isListening ? 'Stop listening' : 'Voice input'}
          >
            <MicIcon />
          </button>
          <button type="submit" className="composer-send" disabled={isSending || (!input.trim() && !pendingImage)} aria-label="Send">
            ↑
          </button>
        </div>
      </div>
    </form>
  )
}
