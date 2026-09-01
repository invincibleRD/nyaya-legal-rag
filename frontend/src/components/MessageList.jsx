import { useCallback, useEffect, useRef, useState } from 'react'
import Message from './Message.jsx'
import { ArrowDown } from './Icons.jsx'

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
  const [pinned, setPinned] = useState(true)

  const toBottom = useCallback((behavior = 'smooth') => {
    bottom.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  // only follow the stream when the reader is already at the bottom
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    const isNewTurn = messages.length !== count.current
    count.current = messages.length
    if (near || isNewTurn) toBottom(isNewTurn ? 'smooth' : 'auto')
  }, [messages, toBottom])

  function onScroll(e) {
    const el = e.currentTarget
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto overflow-x-hidden scroll-pt-6"
      >
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
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

      {!pinned && (
        <button
          onClick={() => toBottom()}
          aria-label="Scroll to latest"
          className="absolute bottom-3 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 animate-popIn place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-lift transition-transform hover:scale-105 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
        >
          <ArrowDown width={16} height={16} />
        </button>
      )}
    </div>
  )
}
