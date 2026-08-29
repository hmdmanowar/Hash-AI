// Fire-and-forget read-aloud, used for auto-speak — cancels anything
// already playing first, same as the per-message Listen button in
// MessageActions.tsx (which tracks its own play/stop state separately,
// since it needs to reflect completion in that specific button's icon).
export function speak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

const GOODBYE_PHRASES = new Set(['bye', 'bye bye', 'goodbye', 'good bye'])

// A spoken command that ends a hands-free voice session — the message
// still gets sent normally (so the assistant can reply), but the caller
// should treat this turn as NOT resuming listening afterward, handing
// control back to the wake word.
export function isGoodbye(text: string): boolean {
  return GOODBYE_PHRASES.has(text.trim().toLowerCase().replace(/[.!?]+$/, ''))
}

// Data-URI prefix for a base64 string as returned by downscaleImage/stored
// in messages — Ollama expects raw base64 (no prefix), but <img src> needs
// the prefix back on to actually render.
export const IMAGE_DATA_URI_PREFIX = 'data:image/jpeg;base64,'

export function toImageSrc(base64: string): string {
  return `${IMAGE_DATA_URI_PREFIX}${base64}`
}

// Downscales an image file client-side before it's ever base64-encoded —
// keeps the payload reasonable regardless of the original photo's size
// (a phone camera photo can be many MB) and most local vision models
// downsample internally anyway, so little quality is lost in practice.
// Resolves to raw base64 (no data-URI prefix), matching what the backend
// (and Ollama's own /api/chat schema) expects.
export function downscaleImage(file: File, maxDimension = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load the selected image'))
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('This browser cannot process images (canvas unavailable)'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const datePart = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${datePart} at ${timePart}`
}
