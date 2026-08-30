import { useState } from 'react'
import AnswerBody from './AnswerBody.jsx'
import { Copy, Check, Refresh } from './Icons.jsx'
import { indexByMarker } from '../lib/citations.js'

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
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink-900 px-4 py-2 text-[15px] text-ink-50 dark:bg-ink-100 dark:text-ink-900">
          {message.content}
        </p>
      </div>
    )
  }

  const byMarker = indexByMarker(message.citations || [])
  const empty = !message.streaming && !message.content

  async function copy() {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group animate-fadeUp" aria-busy={message.streaming || undefined}>
      <AnswerBody
        text={message.content}
        byMarker={byMarker}
        onOpen={onOpenCitation}
        activeMarker={activeMarker}
        streaming={message.streaming}
      />

      {message.streaming && (
        <span
          className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-brass-500 align-middle"
          aria-hidden
        />
      )}

      {empty && (
        <p className="text-sm italic text-ink-700 dark:text-ink-100/60">No answer was returned.</p>
      )}

      {message.stopped && (
        <p className="mt-2 text-xs text-ink-700 dark:text-ink-100/50">Generation stopped.</p>
      )}

      {!message.streaming && message.content && (message.citations || []).length === 0 && (
        <p className="mt-3 rounded-md border border-ink-200 bg-ink-100/60 px-3 py-2 text-xs text-ink-700 dark:border-ink-700 dark:bg-ink-900/50 dark:text-ink-100/60">
          Nothing in the indexed statute matched this closely, so the answer carries no sources.
          Narrow the question or name a section.
        </p>
      )}

      {!message.streaming && message.content && (
        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button className="btn px-2 py-1 text-xs" onClick={copy}>
            {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canRegenerate && (
            <button className="btn px-2 py-1 text-xs" onClick={onRegenerate}>
              <Refresh width={14} height={14} /> Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  )
}
