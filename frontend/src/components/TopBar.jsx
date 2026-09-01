import { Menu, PanelLeft } from './Icons.jsx'

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'forms', label: 'Forms' },
]

export default function TopBar({ tab, onTab, onMenu, collapsed, onToggleSidebar }) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
      <button className="btn-icon md:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu />
      </button>
      <button
        className="btn-icon hidden md:grid"
        onClick={onToggleSidebar}
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <PanelLeft />
      </button>

      <div
        role="tablist"
        aria-label="Panels"
        className="relative flex rounded-xl bg-ink-100 p-0.5 dark:bg-ink-850"
      >
        {/* one sliding pill instead of two backgrounds toggling */}
        <span
          aria-hidden
          className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-[10px] bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-ink-750"
          style={{ transform: `translateX(${tab === 'forms' ? '100%' : '0%'})` }}
        />
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`relative z-10 w-20 rounded-[10px] px-3 py-1 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'text-ink-900 dark:text-ink-50'
                : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="ml-auto hidden truncate font-serif text-sm text-ink-500 sm:block">
        Bharatiya Nagarik Suraksha Sanhita, 2023
      </p>
    </header>
  )
}
