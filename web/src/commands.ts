export type AppCommand =
  | { type: 'new-chat' }
  | { type: 'delete-conversation' }
  | { type: 'enable-voice-assistant' }
  | { type: 'disable-voice-assistant' }

const DELETE_WORDS = ['delete', 'remove', 'clear', 'erase']
const CHAT_WORDS = ['conversation', 'conversations', 'chat', 'chats']
const NEW_WORDS = ['new', 'start', 'open', 'create', 'add']
const OFF_WORDS = ['disable', 'off', 'stop', 'mute']
const ON_WORDS = ['enable', 'on', 'unmute']

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text))
}

// Recognized app-level commands ("delete this conversation", "start a new
// chat", "disable voice assistant") are handled directly by the UI — never
// sent to the AI model. These act on app state the model has no access to
// (conversation storage, browser voice settings) and one of them is
// destructive, so matching them client-side is both more reliable than
// hoping the model recognizes intent and expresses it as a real tool call,
// and safer — deletion still goes through the same confirm step as
// clicking the trash icon, in case speech recognition misheard something.
//
// Matching is keyword-based (action word + target word), not an exact
// phrase — natural commands vary too much ("delete our old conversations",
// "delete this chat", "please delete the conversation") to pin down with a
// rigid sentence pattern. The length cap keeps it from firing on a longer,
// genuinely conversational message that happens to mention these words in
// passing (e.g. a real question about deleting something in some other
// app) — actual commands are short and imperative.
export function matchCommand(text: string): AppCommand | null {
  const trimmed = text.trim()
  if (!trimmed || wordCount(trimmed) > 8) return null

  const mentionsChat = hasAny(trimmed, CHAT_WORDS)
  const mentionsVoice = /\bvoice\b/i.test(trimmed) && /\b(assistant|mode)\b/i.test(trimmed)

  if (mentionsChat && hasAny(trimmed, DELETE_WORDS)) return { type: 'delete-conversation' }
  if (mentionsChat && hasAny(trimmed, NEW_WORDS)) return { type: 'new-chat' }
  if (mentionsVoice && hasAny(trimmed, OFF_WORDS)) return { type: 'disable-voice-assistant' }
  if (mentionsVoice && hasAny(trimmed, ON_WORDS)) return { type: 'enable-voice-assistant' }
  return null
}
