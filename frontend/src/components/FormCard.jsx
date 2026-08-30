import { useState } from 'react'
import { Download, Warning } from './Icons.jsx'
import { formPdf } from '../lib/api.js'
import { saveBlob } from '../lib/download.js'
import { friendly } from '../lib/errors.js'

function size(bytes) {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export default function FormCard({ form, onPreview, onError }) {
  const [busy, setBusy] = useState(false)

  const pages =
    form.page_end && form.page_end !== form.page_start
      ? `pp. ${form.page_start}-${form.page_end}`
      : `p. ${form.page_start}`

  async function download() {
    setBusy(true)
    try {
      saveBlob(await formPdf(form.form_number), form.filename || `${form.form_number}.pdf`)
    } catch (e) {
      onError(friendly(e.code, e.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="card flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-2">
        <span className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-ink-50 dark:bg-ink-100 dark:text-ink-900">
          {form.form_number}
        </span>
        {form.needs_review && (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
            title="Extraction boundaries are uncertain, check the pages"
          >
            <Warning width={12} height={12} /> needs review
          </span>
        )}
      </div>

      <h3 className="mt-2 font-serif text-[15px] font-semibold leading-snug">{form.title}</h3>

      <p className="mt-1 text-xs text-ink-700 dark:text-ink-100/60">
        {form.see_section && <>See section {form.see_section} · </>}
        {pages} · {form.page_count} {form.page_count === 1 ? 'page' : 'pages'}
        {form.bytes ? ` · ${size(form.bytes)}` : ''}
      </p>

      <div className="mt-auto flex gap-2 pt-3">
        <button className="btn flex-1" onClick={() => onPreview(form)}>
          Preview
        </button>
        <button className="btn" onClick={download} disabled={busy} aria-busy={busy}>
          <Download /> {busy ? 'Saving' : 'PDF'}
        </button>
      </div>
    </li>
  )
}
