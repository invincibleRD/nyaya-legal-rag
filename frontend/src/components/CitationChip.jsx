import { citationLabel } from '../lib/citations.js'

export function PendingChip({ label }) {
  return (
    <span className="ml-0.5 inline-block rounded border border-dashed border-ink-200 px-1.5 py-0.5 align-baseline text-[12px] text-ink-700/70 dark:border-ink-700 dark:text-ink-100/50">
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
      className={`ml-0.5 inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 align-baseline text-[12px] font-medium transition-colors ${
        active
          ? 'border-brass-600 bg-brass-500 text-white'
          : 'border-brass-400/50 bg-brass-500/10 text-brass-600 hover:bg-brass-500/20 dark:text-brass-400'
      }`}
    >
      <span className="tabular-nums opacity-70">{citation.index}</span>
      {label}
    </button>
  )
}
