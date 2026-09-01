import { useEffect, useRef, useState } from 'react'
import { Send, Stop, Upload } from './Icons.jsx'

export default function Composer({ onSend, onStop, streaming, onFiles, scopeCount }) {
  const [value, setValue] = useState('')
  const area = useRef(null)
  const picker = useRef(null)

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  function submit(e) {
    e.preventDefault()
    const text = value.trim()
    if (!text || streaming) return
    setValue('')
    onSend(text)
  }

  return (
    <div className="relative shrink-0 px-3 pb-3">
      {/* the column scrolls under the composer, so fade it out rather than cut it */}
      <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-ink-50 to-transparent dark:from-ink-900" />

      <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-1.5 rounded-3xl border border-ink-200 bg-white p-2 shadow-composer transition-colors focus-within:border-brass-400 focus-within:ring-2 focus-within:ring-brass-500/25 dark:border-ink-700 dark:bg-ink-800 dark:focus-within:border-brass-400">
          <button
            type="button"
            className="btn-icon"
            onClick={() => picker.current.click()}
            aria-label="Attach a PDF"
            title="Attach a PDF"
          >
            <Upload width={18} height={18} />
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              onFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />

          <textarea
            ref={area}
            rows={1}
            value={value}
            aria-label="Ask a question"
            placeholder="Ask about the BNSS, or drop in a PDF"
            className="max-h-[200px] flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] leading-6 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-ink-400 dark:placeholder:text-ink-500"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
          />

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-ink-50 transition-transform hover:scale-105 active:scale-95 dark:bg-ink-100 dark:text-ink-900"
            >
              <Stop width={14} height={14} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label="Send"
              title="Send"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brass-500 text-white transition-all hover:bg-brass-600 active:scale-95 disabled:bg-ink-200 disabled:text-ink-400 disabled:active:scale-100 dark:disabled:bg-ink-750 dark:disabled:text-ink-600"
            >
              <Send width={16} height={16} />
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-2 text-[11px] text-ink-500">
          {scopeCount > 0 && (
            <span className="inline-flex items-center gap-1 text-brass-600 dark:text-brass-400">
              <span className="h-1.5 w-1.5 rounded-full bg-brass-500" />
              {scopeCount} uploaded {scopeCount === 1 ? 'document' : 'documents'} in scope
              <span aria-hidden>·</span>
            </span>
          )}
          <span>Informational only, not legal advice.</span>
        </div>
      </form>
    </div>
  )
}
