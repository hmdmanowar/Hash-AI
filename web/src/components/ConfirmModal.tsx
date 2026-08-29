import { useEffect } from 'react'

// Small, generic confirm dialog — replaces window.confirm() so destructive
// actions (currently just delete-conversation) match the app's own theme
// instead of popping a native browser dialog.
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
