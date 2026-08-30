import { Menu } from './Icons.jsx'

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'forms', label: 'Forms' },
]

export default function TopBar({ tab, onTab, onMenu }) {
  return (
    <header className="flex items-center gap-3 border-b border-ink-200 bg-white/80 px-3 py-2 backdrop-blur dark:border-ink-700 dark:bg-ink-800/80">
      <button className="btn px-2 md:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu />
      </button>

      <div
        role="tablist"
        aria-label="Panels"
        className="flex rounded-md border border-ink-200 p-0.5 dark:border-ink-700"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-900'
                : 'text-ink-700 hover:bg-ink-100 dark:text-ink-100/70 dark:hover:bg-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="ml-auto hidden truncate font-serif text-sm text-ink-700 dark:text-ink-100/60 sm:block">
        BNSS 2023 assistant
      </p>
    </header>
  )
}
