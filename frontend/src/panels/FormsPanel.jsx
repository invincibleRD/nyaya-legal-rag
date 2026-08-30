import { useEffect, useState } from 'react'
import ErrorNotice from '../components/ErrorNotice.jsx'
import FormCard from '../components/FormCard.jsx'
import FormPreview from '../components/FormPreview.jsx'
import { FormsSkeleton } from '../components/Skeletons.jsx'
import { Download, Search } from '../components/Icons.jsx'
import { formsZip, listForms, searchForms } from '../lib/api.js'
import { saveBlob } from '../lib/download.js'
import { friendly } from '../lib/errors.js'

export default function FormsPanel() {
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [preview, setPreview] = useState(null)
  const [zipping, setZipping] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(
      () => {
        const q = query.trim()
        const load = q ? searchForms(q) : listForms()
        load
          .then((r) => !cancelled && setForms(r.forms || []))
          .catch((e) => !cancelled && setError(friendly(e.code, e.message)))
          .finally(() => !cancelled && setLoading(false))
      },
      query ? 250 : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  async function downloadAll() {
    setZipping(true)
    try {
      saveBlob(await formsZip(), 'bnss-forms.zip')
    } catch (e) {
      setError(friendly(e.code, e.message))
    } finally {
      setZipping(false)
    }
  }

  const visible = reviewOnly ? forms.filter((f) => f.needs_review) : forms
  const flagged = forms.filter((f) => f.needs_review).length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold">Forms</h1>
            <p className="text-sm text-ink-700 dark:text-ink-100/60">
              Every form extracted from the schedule, split into its own PDF.
            </p>
          </div>
          <button
            className="btn ml-auto"
            onClick={downloadAll}
            disabled={zipping}
            aria-busy={zipping}
          >
            <Download /> {zipping ? 'Preparing zip' : 'Download all as zip'}
          </button>
        </div>

        <div className="sticky top-0 z-10 -mx-1 mt-4 flex flex-wrap items-center gap-3 bg-ink-50/95 px-1 py-2 backdrop-blur dark:bg-ink-900/95">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-700 dark:text-ink-100/50" />
            <input
              type="search"
              className="field pl-8"
              placeholder="Search by title, e.g. bail"
              aria-label="Search forms"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="flex select-none items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brass-500"
              checked={reviewOnly}
              onChange={(e) => setReviewOnly(e.target.checked)}
            />
            Needs review only{' '}
            {flagged > 0 && <span className="text-ink-700 dark:text-ink-100/50">({flagged})</span>}
          </label>
        </div>

        {error && (
          <div className="mb-3">
            <ErrorNotice onDismiss={() => setError(null)}>{error}</ErrorNotice>
          </div>
        )}

        {loading ? (
          <FormsSkeleton />
        ) : visible.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-700 dark:text-ink-100/60">
            No forms match {query ? `"${query}"` : 'this filter'}.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-700 dark:text-ink-100/50" aria-live="polite">
              {visible.length} {visible.length === 1 ? 'form' : 'forms'}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((f) => (
                <FormCard key={f.form_number} form={f} onPreview={setPreview} onError={setError} />
              ))}
            </ul>
          </>
        )}
      </div>

      {preview && <FormPreview form={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
