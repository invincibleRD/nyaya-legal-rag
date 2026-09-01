import StageBar from './StageBar.jsx'
import { Doc, Trash, Warning } from './Icons.jsx'

export default function DocumentItem({ doc, onRemove }) {
  const ready = doc.status === 'ready'
  const failed = doc.status === 'failed'

  return (
    <li className="animate-fadeUp rounded-xl border border-ink-200 bg-white p-2.5 transition-colors dark:border-ink-750 dark:bg-ink-800">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-lg ${
            failed
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : ready
                ? 'bg-brass-500/12 text-brass-600 dark:text-brass-400'
                : 'bg-ink-100 text-ink-500 dark:bg-ink-750'
          }`}
        >
          <Doc width={13} height={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={doc.filename}>
            {doc.filename}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {ready
              ? `ready · ${doc.pages || 0} pages · ${doc.chunks || 0} chunks`
              : failed
                ? doc.error || 'processing failed'
                : `${doc.status}…`}
          </p>
        </div>
        {onRemove && !doc.pending && (
          <button
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-750 dark:hover:text-ink-100"
            onClick={() => onRemove(doc.document_id)}
            aria-label={`Remove ${doc.filename}`}
          >
            <Trash width={13} height={13} />
          </button>
        )}
      </div>

      {!ready && !failed && (
        <div className="mt-2.5">
          <StageBar status={doc.status} progress={doc.progress} />
        </div>
      )}
      {failed && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <Warning width={12} height={12} /> not queryable
        </p>
      )}
    </li>
  )
}
