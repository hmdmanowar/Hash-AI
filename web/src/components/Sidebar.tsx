import type { ConversationSummary, JarvisInfo } from '../api'
import { PanelIcon, ComposeIcon, SpeakerIcon, SpeakerOffIcon, MicIcon } from './icons'
import { ConversationRow } from './ConversationRow'

export function Sidebar({
  info,
  collapsed,
  onToggleCollapsed,
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  theme,
  onToggleTheme,
  autoSpeakEnabled,
  onToggleAutoSpeak,
  wakeWordEnabled,
  onToggleWakeWord,
  wakeWordSupported,
  wakeWordPermissionDenied,
}: {
  info: JarvisInfo | null
  collapsed: boolean
  onToggleCollapsed: () => void
  conversations: ConversationSummary[]
  activeConversationId: string | undefined
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (conversation: ConversationSummary) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  autoSpeakEnabled: boolean
  onToggleAutoSpeak: () => void
  wakeWordEnabled: boolean
  onToggleWakeWord: () => void
  wakeWordSupported: boolean
  wakeWordPermissionDenied: boolean
}) {
  const assistantName = info?.assistantName ?? 'Jarvis'
  const wakeWordTitle = wakeWordPermissionDenied
    ? 'Microphone permission was denied — allow it in your browser to use the wake word'
    : !wakeWordSupported
      ? 'Wake word is not supported in this browser'
      : wakeWordEnabled
        ? `Wake word on — say "Hey ${assistantName}" to start listening`
        : `Turn on wake word ("Hey ${assistantName}")`
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="brand">
            <img className="brand-mark" src="/logo.png" alt="" />
            <span className="brand-name">{info?.assistantName ?? 'Hash AI'}</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelIcon />
        </button>
      </div>

      {collapsed ? (
        <button type="button" className="new-chat-icon" onClick={onNewChat} aria-label="New chat">
          <ComposeIcon />
        </button>
      ) : (
        <>
          <button type="button" className="conversation-item new-chat" onClick={onNewChat}>
            + New chat
          </button>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeConversationId}
                onSelect={() => onSelectConversation(conversation.id)}
                onRename={(title) => onRenameConversation(conversation.id, title)}
                onDelete={() => onDeleteConversation(conversation)}
              />
            ))}
          </div>
          <div className="sidebar-footer">
            {info && <span className="model-tag">{info.model}</span>}
            <button
              type="button"
              className={`theme-toggle${wakeWordEnabled ? ' active' : ''}`}
              onClick={onToggleWakeWord}
              disabled={!wakeWordSupported || wakeWordPermissionDenied}
              aria-label={wakeWordEnabled ? 'Turn off wake word' : 'Turn on wake word'}
              title={wakeWordTitle}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              className={`theme-toggle${autoSpeakEnabled ? ' active' : ''}`}
              onClick={onToggleAutoSpeak}
              aria-label={autoSpeakEnabled ? 'Turn off auto-speak replies' : 'Turn on auto-speak replies'}
              title={autoSpeakEnabled ? 'Auto-speak replies: on' : 'Auto-speak replies: off'}
            >
              {autoSpeakEnabled ? <SpeakerIcon /> : <SpeakerOffIcon />}
            </button>
            <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
