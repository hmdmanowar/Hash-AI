import { usePersistentToggle } from './usePersistentToggle'

export function useAutoSpeak() {
  const { value: enabled, toggle } = usePersistentToggle('jarvis-auto-speak')
  return { enabled, toggle }
}
