import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognitionConstructor, type SpeechRecognitionLike } from './speechRecognitionTypes'

// Reports the accumulated transcript for the current listening session on
// every result (interim results included, so the caller can show live
// text as the user speaks) — stops on its own after a natural pause since
// `continuous` is off, matching a normal "press mic, say one thing" flow.
// `onNaturalEnd` fires only when that happens on its own (silence timeout),
// not when the caller explicitly calls stop() — the latter usually means
// the user is cancelling, not confirming, so it shouldn't trigger the same
// "they're done talking" behavior (e.g. auto-submitting).
export function useSpeechRecognition(onResult: (transcript: string, isFinal: boolean) => void, onNaturalEnd?: () => void) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(() => getSpeechRecognitionConstructor() !== undefined)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onResultRef = useRef(onResult)
  const onNaturalEndRef = useRef(onNaturalEnd)
  const manualStopRef = useRef(false)
  // Mirrors `isListening` but is read inside start()/stop() instead of the
  // state value, because those functions can be invoked from deep inside an
  // async chain (see App.tsx: onNaturalEnd -> handleSend -> sendText ->
  // ...await sendMessage()... -> startMic()) that captured its closures back
  // when recognition first ended, while `isListening` was still frozen at
  // `true` in that closure. By the time the chain actually calls start()
  // again, real state has long since become false, but the stale `true`
  // from that old render would incorrectly block the restart. A ref always
  // reads the current value regardless of which render's closure is live.
  const isListeningRef = useRef(false)
  onResultRef.current = onResult
  onNaturalEndRef.current = onNaturalEnd

  function setListening(value: boolean) {
    isListeningRef.current = value
    setIsListening(value)
  }

  useEffect(() => {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (event) => {
      let transcript = ''
      let isFinal = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
        if (event.results[i].isFinal) isFinal = true
      }
      onResultRef.current(transcript, isFinal)
    }
    recognition.onend = () => {
      setListening(false)
      const wasManual = manualStopRef.current
      manualStopRef.current = false
      if (!wasManual) onNaturalEndRef.current?.()
    }
    recognition.onerror = () => {
      setListening(false)
      manualStopRef.current = false
    }
    recognitionRef.current = recognition

    return () => recognition.stop()
  }, [])

  function start() {
    if (!recognitionRef.current || isListeningRef.current) return
    manualStopRef.current = false
    setListening(true)
    try {
      // Can throw if a wake-word recognition session (a separate instance)
      // is still winding down on the same underlying mic/service — the
      // wake-word hook always stops itself right before handing off here,
      // but the two are different objects so there can be a tiny overlap.
      recognitionRef.current.start()
    } catch {
      setListening(false)
    }
  }

  function stop() {
    manualStopRef.current = true
    recognitionRef.current?.stop()
    setListening(false)
  }

  return { isSupported, isListening, start, stop }
}
