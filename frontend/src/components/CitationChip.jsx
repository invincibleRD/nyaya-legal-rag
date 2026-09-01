import { citationLabel } from '../lib/citations.js'

export function PendingChip({ label }) {
  return (
    <span className="mx-0.5 inline-flex items-baseline rounded-md border border-dashed border-ink-300 px-1.5 py-px align-baseline text-[12px] text-ink-400 dark:border-ink-600 dark:text-ink-500">
      {label.replace(/^\[|\]$/g, '')}
    </span>
  )
}

export default function CitationChip({ citation, onOpen, active }) {
  const label = citationLabel(citation)
  return (
    <button
      onClick={() => onOpen(citation)}
      aria-label={`Show source ${label}`}
      aria-pressed={active}
      className={`mx-0.5 inline-flex items-baseline gap-1 rounded-md border px-1.5 py-px align-baseline text-[12px] font-medium transition-all duration-150 hover:-translate-y-px ${
        active
          ? 'border-brass-600 bg-brass-500 text-white shadow-sm'
          : 'border-brass-500/25 bg-brass-500/10 text-brass-600 hover:border-brass-500/50 hover:bg-brass-500/20 dark:text-brass-300'
      }`}
    >
      <span className="tabular-nums opacity-60">{citation.index}</span>
      {label}
    </button>
  )
}
