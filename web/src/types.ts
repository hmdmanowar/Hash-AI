export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  // Base64-encoded images (no data-URI prefix) attached to this message.
  images?: string[]
}

export interface MicControls {
  isSupported: boolean
  isListening: boolean
  toggle: () => void
}
