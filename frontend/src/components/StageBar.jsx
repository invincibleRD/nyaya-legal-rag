import { STAGES } from '../lib/useDocuments.js'

const LABELS = { parsing: 'parse', chunking: 'chunk', embedding: 'embed', ready: 'ready' }

export default function StageBar({ status, progress = 0 }) {
  if (status === 'failed') return null
  const current = status === 'queued' ? -1 : STAGES.indexOf(status)
  const pct = status === 'ready' ? 100 : Math.max(progress * 100, ((current + 1) / 4) * 100 - 12)

  return (
    <div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
        <div
          className="h-full rounded-full bg-brass-500 transition-[width] duration-500"
          style={{ width: `${Math.max(6, Math.min(100, pct))}%` }}
        />
      </div>
      <ol className="mt-1 flex justify-between text-[11px] text-ink-700 dark:text-ink-100/60">
        {STAGES.map((stage, i) => (
          <li
            key={stage}
            className={i <= current ? 'font-medium text-brass-600 dark:text-brass-400' : ''}
          >
            {LABELS[stage]}
          </li>
        ))}
      </ol>
    </div>
  )
}
