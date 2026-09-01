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
        className="fixed inset-0 z-30 animate-fadeIn bg-black/40 backdrop-blur-[2px] md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Source: ${heading}`}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm animate-drawerIn flex-col border-l border-ink-200 bg-white shadow-drawer dark:border-ink-750 dark:bg-ink-850 md:static md:z-auto md:w-[23rem] md:max-w-none md:shrink-0 md:shadow-none"
      >
        <div className="flex items-start gap-2 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brass-600 dark:text-brass-400">
              {citation.source === 'document' ? 'Your document' : 'Statute'}
            </p>
            <h2 className="mt-0.5 font-serif text-base font-semibold leading-tight">{heading}</h2>
          </div>
          <button ref={closeRef} className="btn-icon" onClick={onClose} aria-label="Close source">
            <Close />
          </button>
        </div>

        <dl className="mx-4 grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-ink-200 bg-ink-100/50 px-3.5 py-3 text-xs dark:border-ink-750 dark:bg-ink-800/50">
          {citation.section_title && (
            <div className="col-span-2">
              <dt className="text-ink-500">Title</dt>
              <dd className="mt-0.5 font-medium leading-snug">{citation.section_title}</dd>
            </div>
          )}
          {citation.chapter && (
            <div>
              <dt className="text-ink-500">Chapter</dt>
              <dd className="mt-0.5 font-medium">{citation.chapter}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-500">Page</dt>
            <dd className="mt-0.5 font-medium">{pageLabel(citation) || 'not recorded'}</dd>
          </div>
          {typeof citation.score === 'number' && (
            <div>
              <dt className="text-ink-500">Match score</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{citation.score.toFixed(2)}</dd>
            </div>
          )}
        </dl>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <p className="rule mb-2 px-0">Verbatim text</p>
          <blockquote className="whitespace-pre-wrap border-l-2 border-brass-400 pl-3.5 font-serif text-[15px] leading-[1.8]">
            {citation.text}
          </blockquote>
        </div>
      </aside>
    </>
  )
}
