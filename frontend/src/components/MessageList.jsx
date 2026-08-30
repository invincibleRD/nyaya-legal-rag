import { useEffect, useRef } from 'react'
import Message from './Message.jsx'

export default function MessageList({
  messages,
  onOpenCitation,
  activeMarker,
  onRegenerate,
  streaming,
}) {
  const bottom = useRef(null)
  const scroller = useRef(null)
  const count = useRef(messages.length)

  // only follow the stream when the reader is already at the bottom
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    const isNewTurn = messages.length !== count.current
    count.current = messages.length
    if (near || isNewTurn)
      bottom.current?.scrollIntoView({ behavior: isNewTurn ? 'smooth' : 'auto', block: 'end' })
  }, [messages])

  return (
    <div ref={scroller} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        {messages.map((m, i) => (
          <Message
            key={m.id || i}
            message={m}
            onOpenCitation={onOpenCitation}
            activeMarker={activeMarker}
            onRegenerate={onRegenerate}
            canRegenerate={!streaming && m.role === 'assistant' && i === messages.length - 1}
          />
        ))}
        <div ref={bottom} />
      </div>
    </div>
  )
}
