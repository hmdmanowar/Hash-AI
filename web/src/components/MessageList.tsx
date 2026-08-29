import type { RefObject } from 'react'
import type { Message } from '../types'
import { MessageBody } from './MessageBody'

export function MessageList({
  messages,
  isSending,
  bottomRef,
}: {
  messages: Message[]
  isSending: boolean
  bottomRef: RefObject<HTMLDivElement>
}) {
  return (
    <div className="scroll-area">
      {messages.map((message, index) =>
        message.role === 'user' ? (
          <div key={index} className="row user-row">
            <div className="user-bubble">{message.content}</div>
          </div>
        ) : (
          <div key={index} className="row assistant-row">
            <img className="avatar" src="/logo.png" alt="" />
            <div className="assistant-content">
              <MessageBody content={message.content} />
            </div>
          </div>
        ),
      )}

      {isSending && (
        <div className="row assistant-row">
          <img className="avatar" src="/logo.png" alt="" />
          <div className="assistant-content">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
