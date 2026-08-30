import { useEffect, useRef } from 'react'
import { Close } from './Icons.jsx'
import { pageLabel } from '../lib/citations.js'

export default function SourceDrawer({ citation, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    function esc(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const heading =
    citation.source === 'document'
      ? citation.document_name || 'Uploaded document'
      : `${citation.act_short} section ${citation.section_number}${citation.subsection || ''}`

  return (
    <>
      <div
        className="fixed inset-0 z-30 animate-fadeIn bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Source: ${heading}`}
        className="fixed inset-y-0 right-0 z-40 flex animate-slideIn w-full max-w-sm flex-col border-l border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800 md:static md:z-auto md:w-[22rem] md:max-w-none md:shrink-0"
      >
        <div className="flex items-start gap-2 border-b border-ink-200 px-4 py-3 dark:border-ink-700">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brass-600 dark:text-brass-400">
              {citation.source === 'document' ? 'Your document' : 'Statute'}
            </p>
            <h2 className="font-serif text-base font-semibold leading-tight">{heading}</h2>
          </div>
          <button
            ref={closeRef}
            className="btn px-2 py-1"
            onClick={onClose}
            aria-label="Close source"
          >
            <Close />
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-ink-200 px-4 py-3 text-xs dark:border-ink-700">
          {citation.section_title && (
            <div className="col-span-2">
              <dt className="text-ink-700 dark:text-ink-100/50">Title</dt>
              <dd className="font-medium">{citation.section_title}</dd>
            </div>
          )}
          {citation.chapter && (
            <div>
              <dt className="text-ink-700 dark:text-ink-100/50">Chapter</dt>
              <dd className="font-medium">{citation.chapter}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-700 dark:text-ink-100/50">Page</dt>
            <dd className="font-medium">{pageLabel(citation) || 'not recorded'}</dd>
          </div>
          {typeof citation.score === 'number' && (
            <div>
              <dt className="text-ink-700 dark:text-ink-100/50">Match score</dt>
              <dd className="font-medium tabular-nums">{citation.score.toFixed(2)}</dd>
            </div>
          )}
        </dl>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-700 dark:text-ink-100/50">
            Verbatim text
          </p>
          <blockquote className="whitespace-pre-wrap border-l-2 border-brass-400 pl-3 font-serif text-[15px] leading-7">
            {citation.text}
          </blockquote>
        </div>
      </aside>
    </>
  )
}
