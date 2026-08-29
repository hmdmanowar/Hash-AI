import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognitionConstructor, type SpeechRecognitionConstructor, type SpeechRecognitionLike } from './speechRecognitionTypes'

// Continuously listens in the background for a wake phrase (e.g. "hey
// jarvis") and fires onWake() once when heard. `enabled` is meant to be
// computed by the caller as "the toggle is on AND nothing else is using
// the mic/speakers right now" (see App.tsx) — only one recognition session
// can usefully run at a time, and this would otherwise fight with active
// command capture or risk picking up Jarvis's own spoken replies.
export function useWakeWord(wakePhrase: string, enabled: boolean, onWake: () => void) {
  const [isSupported] = useState(() => getSpeechRecognitionConstructor() !== undefined)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const onWakeRef = useRef(onWake)
  const wakePhraseRef = useRef(wakePhrase.toLowerCase())
  onWakeRef.current = onWake
  wakePhraseRef.current = wakePhrase.toLowerCase()

  useEffect(() => {
    if (!enabled) return
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    let stopped = false
    let hasWoken = false
    let recognition: SpeechRecognitionLike | null = null

    function startInstance(Constructor: SpeechRecognitionConstructor) {
      recognition = new Constructor()
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = navigator.language || 'en-US'
      recognition.onresult = (event) => {
        if (hasWoken) return
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase()
          if (transcript.includes(wakePhraseRef.current)) {
            hasWoken = true
            recognition?.stop()
            onWakeRef.current()
            return
          }
        }
      }
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopped = true
          setPermissionDenied(true)
        }
        // Other errors (no-speech, network blips, aborted) are recoverable —
        // onend below restarts the session as long as we haven't stopped.
      }
      recognition.onend = () => {
        if (!stopped && !hasWoken) {
          try {
            recognition?.start()
          } catch {
            // Already starting/started — a stray duplicate onend, ignore.
          }
        }
      }
      recognition.start()
    }

    startInstance(Ctor)

    return () => {
      stopped = true
      recognition?.stop()
    }
  }, [enabled])

  return { isSupported, permissionDenied }
}
