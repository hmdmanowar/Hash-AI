// The Web Speech recognition API is still non-standard/vendor-prefixed
// (Chrome/Edge only, as `webkitSpeechRecognition`), so it isn't in
// TypeScript's lib.dom types — declared narrowly here for just the subset
// useSpeechRecognition.ts and useWakeWord.ts need, rather than pulling in a
// full ambient-types package.
export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly [index: number]: { readonly transcript: string }
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike }
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  start(): void
  stop(): void
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
