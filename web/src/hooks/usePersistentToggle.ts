import { useEffect, useState } from 'react'

// Shared by every simple on/off setting that should survive a page reload
// (sidebar collapsed, auto-speak, wake word) — avoids repeating the same
// localStorage read/write boilerplate in each one.
export function usePersistentToggle(key: string, defaultValue = false) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key)
    return stored === null ? defaultValue : stored === 'true'
  })

  useEffect(() => {
    localStorage.setItem(key, String(value))
  }, [key, value])

  return { value, setValue, toggle: () => setValue((v) => !v) }
}
