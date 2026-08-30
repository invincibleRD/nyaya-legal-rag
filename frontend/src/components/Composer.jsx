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
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  function submit(e) {
    e.preventDefault()
    const text = value.trim()
    if (!text || streaming) return
    setValue('')
    onSend(text)
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-ink-200 bg-white px-3 py-3 dark:border-ink-700 dark:bg-ink-800"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border border-ink-200 bg-ink-50 p-2 focus-within:border-brass-400 dark:border-ink-700 dark:bg-ink-900">
          <button
            type="button"
            className="btn px-2 py-1.5"
            onClick={() => picker.current.click()}
            aria-label="Attach a PDF"
            title="Attach a PDF"
          >
            <Upload />
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
            placeholder="Ask a question about the BNSS"
            className="max-h-44 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-ink-700/50 dark:placeholder:text-ink-100/40"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
          />

          {streaming ? (
            <button type="button" className="btn px-3 py-1.5" onClick={onStop}>
              <Stop /> Stop
            </button>
          ) : (
            <button type="submit" className="btn btn-primary px-3 py-1.5" disabled={!value.trim()}>
              <Send /> Send
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-700 dark:text-ink-100/50">
          <span>Enter sends, Shift+Enter adds a line.</span>
          {scopeCount > 0 && (
            <span className="text-brass-600 dark:text-brass-400">
              {scopeCount} uploaded {scopeCount === 1 ? 'document' : 'documents'} in scope
            </span>
          )}
          <span className="ml-auto">Informational only, not legal advice.</span>
        </div>
      </div>
    </form>
  )
}
