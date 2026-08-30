import StageBar from './StageBar.jsx'
import { Doc, Trash, Warning } from './Icons.jsx'

export default function DocumentItem({ doc, onRemove }) {
  const ready = doc.status === 'ready'
  const failed = doc.status === 'failed'

  return (
    <li className="rounded-md border border-ink-200 p-2 dark:border-ink-700">
      <div className="flex items-start gap-2">
        <Doc className="mt-0.5 shrink-0 text-ink-700 dark:text-ink-100/60" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={doc.filename}>
            {doc.filename}
          </p>
          <p className="text-[11px] text-ink-700 dark:text-ink-100/60">
            {ready
              ? `ready · ${doc.pages || 0} pages · ${doc.chunks || 0} chunks`
              : failed
                ? doc.error || 'processing failed'
                : `${doc.status}...`}
          </p>
        </div>
        {onRemove && !doc.pending && (
          <button
            className="rounded p-1 text-ink-700 hover:bg-ink-100 dark:text-ink-100/60 dark:hover:bg-ink-700"
            onClick={() => onRemove(doc.document_id)}
            aria-label={`Remove ${doc.filename}`}
          >
            <Trash width={14} height={14} />
          </button>
        )}
      </div>

      {!ready && !failed && (
        <div className="mt-2">
          <StageBar status={doc.status} progress={doc.progress} />
        </div>
      )}
      {failed && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <Warning width={12} height={12} /> not queryable
        </p>
      )}
    </li>
  )
}
