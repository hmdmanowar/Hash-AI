import { useEffect, useState } from 'react'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('jarvis-sidebar-collapsed') === 'true')

  useEffect(() => {
    localStorage.setItem('jarvis-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  return { collapsed, toggle: () => setCollapsed((c) => !c) }
}
