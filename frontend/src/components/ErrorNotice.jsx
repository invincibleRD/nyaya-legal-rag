import { Close, Warning } from './Icons.jsx'

export default function ErrorNotice({ children, onDismiss, onRetry }) {
  return (
    <div
      role="alert"
      className="flex animate-fadeUp items-start gap-2.5 rounded-xl border border-red-300/70 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200"
    >
      <Warning className="mt-0.5 shrink-0" />
      <p className="flex-1 leading-relaxed">{children}</p>
      {onRetry && (
        <button
          className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70"
        >
          <Close width={14} height={14} />
        </button>
      )}
    </div>
  )
}
