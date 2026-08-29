import { useState } from 'react'
import { CopyIcon, ShareIcon, EditIcon, SpeakerIcon, SpeakerOffIcon } from './icons'

const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function MessageActions({ content, onEdit }: { content: string; onEdit?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  function handleSpeak() {
    if (!speechSupported) return
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }
    window.speechSynthesis.cancel() // stop anything already speaking elsewhere on the page
    const utterance = new SpeechSynthesisUtterance(content)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be blocked — nothing to fall back to here.
    }
  }

  async function handleShare() {
    // Delegates to the OS share sheet where available; otherwise falls back
    // to copying, since this is a local tool with no accounts or hosted
    // conversations to generate a real shareable link from.
    if (navigator.share) {
      try {
        await navigator.share({ text: content })
        return
      } catch {
        // User cancelled, or the platform rejected it — fall through.
      }
    }
    await handleCopy()
  }

  return (
    <div className="message-actions">
      <button type="button" onClick={handleCopy} aria-label="Copy" title="Copy">
        <CopyIcon />
        {copied && <span>Copied</span>}
      </button>
      <button type="button" onClick={handleShare} aria-label="Share" title="Share">
        <ShareIcon />
      </button>
      {speechSupported && (
        <button type="button" onClick={handleSpeak} aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'} title={isSpeaking ? 'Stop' : 'Listen'}>
          {isSpeaking ? <SpeakerOffIcon /> : <SpeakerIcon />}
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label="Edit" title="Edit">
          <EditIcon />
        </button>
      )}
    </div>
  )
}
