import { useState } from 'react'
import AnswerBody from './AnswerBody.jsx'
import { Copy, Check, Refresh, Scales } from './Icons.jsx'
import { indexByMarker } from '../lib/citations.js'

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-thinking rounded-full bg-ink-400 dark:bg-ink-500"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  )
}

export default function Message({
  message,
  onOpenCitation,
  activeMarker,
  onRegenerate,
  canRegenerate,
}) {
  const [copied, setCopied] = useState(false)

  if (message.role === 'user') {
    return (
      <div className="flex animate-fadeUp justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-ink-100 px-4 py-2.5 text-[15px] leading-relaxed dark:bg-ink-750">
          {message.content}
        </p>
      </div>
    )
  }

  const byMarker = indexByMarker(message.citations || [])
  const empty = !message.streaming && !message.content
  const waiting = message.streaming && !message.content

  async function copy() {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group animate-fadeUp flex gap-3" aria-busy={message.streaming || undefined}>
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-ink-200 bg-white text-brass-500 dark:border-ink-700 dark:bg-ink-800"
        aria-hidden
      >
        <Scales width={15} height={15} />
      </span>

      <div className="min-w-0 flex-1">
        {waiting ? (
          <Thinking />
        ) : (
          <AnswerBody
            text={message.content}
            byMarker={byMarker}
            onOpen={onOpenCitation}
            activeMarker={activeMarker}
            streaming={message.streaming}
          />
        )}

        {message.streaming && message.content && (
          <span
            className="ml-0.5 inline-block h-[1.05em] w-[2px] animate-caret bg-brass-500 align-text-bottom"
            aria-hidden
          />
        )}

        {empty && <p className="text-sm italic text-ink-500">No answer was returned.</p>}

        {message.stopped && <p className="mt-2 text-xs text-ink-500">Generation stopped.</p>}

        {!message.streaming && message.content && (message.citations || []).length === 0 && (
          <p className="mt-4 rounded-xl border border-ink-200 bg-ink-100/60 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600 dark:border-ink-700 dark:bg-ink-850/60 dark:text-ink-400">
            Nothing in the indexed statute matched this closely, so the answer carries no sources.
            Narrow the question or name a section.
          </p>
        )}

        {/* the row is always in the layout so finishing a stream never shifts it */}
        {message.content && (
          <div
            className={`mt-2 flex h-7 items-center gap-0.5 transition-opacity duration-200 ${
              message.streaming
                ? 'pointer-events-none opacity-0'
                : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
            }`}
          >
            <button className="btn-ghost px-2 py-1 text-xs" onClick={copy}>
              {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {canRegenerate && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={onRegenerate}>
                <Refresh width={14} height={14} /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
