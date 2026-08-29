import { usePersistentToggle } from './usePersistentToggle'

export function useSidebarCollapsed() {
  const { value: collapsed, toggle } = usePersistentToggle('jarvis-sidebar-collapsed')
  return { collapsed, toggle }
}
