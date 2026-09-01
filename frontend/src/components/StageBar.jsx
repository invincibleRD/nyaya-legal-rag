import { STAGES } from '../lib/useDocuments.js'

const LABELS = { parsing: 'parse', chunking: 'chunk', embedding: 'embed', ready: 'ready' }

export default function StageBar({ status, progress = 0 }) {
  if (status === 'failed') return null
  const current = status === 'queued' ? -1 : STAGES.indexOf(status)
  const pct = status === 'ready' ? 100 : Math.max(progress * 100, ((current + 1) / 4) * 100 - 12)

  return (
    <div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-750">
        <div
          className="h-full rounded-full bg-brass-500 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(6, Math.min(100, pct))}%` }}
        />
      </div>
      <ol className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wide text-ink-400">
        {STAGES.map((stage, i) => (
          <li
            key={stage}
            className={
              i <= current ? 'text-brass-600 transition-colors dark:text-brass-400' : undefined
            }
          >
            {LABELS[stage]}
          </li>
        ))}
      </ol>
    </div>
  )
}
