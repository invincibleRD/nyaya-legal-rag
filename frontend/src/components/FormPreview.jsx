import { useEffect, useRef, useState } from 'react'
import ErrorNotice from './ErrorNotice.jsx'
import { Close, Download } from './Icons.jsx'
import { formPdf } from '../lib/api.js'
import { saveBlob } from '../lib/download.js'
import { friendly } from '../lib/errors.js'

export default function FormPreview({ form, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  const blob = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    function esc(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  useEffect(() => {
    let objectUrl
    formPdf(form.form_number)
      .then((b) => {
        blob.current = b
        objectUrl = URL.createObjectURL(b)
        setUrl(objectUrl)
      })
      .catch((e) => setError(friendly(e.code, e.message)))
    return () => objectUrl && URL.revokeObjectURL(objectUrl)
  }, [form.form_number])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6">
      <div className="absolute inset-0 animate-fadeIn bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${form.form_number}`}
        className="relative flex h-full w-full animate-popIn flex-col overflow-hidden bg-white dark:bg-ink-800 sm:h-[85vh] sm:max-w-3xl sm:rounded-lg"
      >
        <div className="flex items-center gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-700">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-ink-700 dark:text-ink-100/60">
              {form.form_number}
            </p>
            <h2 className="truncate font-serif text-base font-semibold">{form.title}</h2>
          </div>
          <button
            className="btn ml-auto"
            disabled={!url}
            onClick={() => saveBlob(blob.current, form.filename || `${form.form_number}.pdf`)}
          >
            <Download /> Download
          </button>
          <button ref={closeRef} className="btn px-2" onClick={onClose} aria-label="Close preview">
            <Close />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-ink-100 dark:bg-ink-900">
          {error ? (
            <div className="p-4">
              <ErrorNotice>{error}</ErrorNotice>
            </div>
          ) : url ? (
            <iframe
              src={url}
              title={`${form.form_number} preview`}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="skeleton absolute inset-4" />
          )}
        </div>
      </div>
    </div>
  )
}
