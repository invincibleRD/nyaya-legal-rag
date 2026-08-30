import { Close, Warning } from './Icons.jsx'

export default function ErrorNotice({ children, onDismiss, onRetry }) {
  return (
    <div
      role="alert"
      className="flex animate-fadeUp items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
    >
      <Warning className="mt-0.5 shrink-0" />
      <p className="flex-1">{children}</p>
      {onRetry && (
        <button className="underline underline-offset-2" onClick={onRetry}>
          Retry
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error" className="rounded p-0.5">
          <Close width={14} height={14} />
        </button>
      )}
    </div>
  )
}
