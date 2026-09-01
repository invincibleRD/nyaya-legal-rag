import { useEffect } from 'react'
import ConversationItem from './ConversationItem.jsx'
import DocumentItem from './DocumentItem.jsx'
import { ListSkeleton } from './Skeletons.jsx'
import { groupByDate } from '../lib/groupByDate.js'
import { Close, Moon, Plus, Scales, Sun } from './Icons.jsx'

export default function Sidebar({
  open,
  onClose,
  conversations,
  loading,
  currentId,
  onSelect,
  onNew,
  onChanged,
  onSelectedDeleted,
  documents,
  theme,
  onToggleTheme,
  collapsed,
}) {
  useEffect(() => {
    if (!open) return
    function esc(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])

  const groups = groupByDate(conversations)

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 animate-fadeIn bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        inert={collapsed ? '' : undefined}
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-ink-200 bg-ink-100/60 transition-[transform,visibility] duration-200 dark:border-ink-750 dark:bg-ink-850 md:visible md:static md:translate-x-0 md:transition-[width,opacity] ${
          open ? 'w-72 translate-x-0' : 'w-72 invisible -translate-x-full'
        } ${collapsed ? 'md:w-0 md:overflow-hidden md:border-r-0 md:opacity-0' : 'md:w-72 md:opacity-100'}`}
        aria-label="Conversations and documents"
      >
        <div className="flex w-72 min-w-[18rem] flex-1 flex-col">
          <div className="flex items-center gap-2 px-3 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brass-500/15 text-brass-600 dark:text-brass-400">
              <Scales width={16} height={16} />
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight">Nyaya</span>
            <span className="rounded-md bg-brass-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brass-600 dark:text-brass-400">
              BNSS
            </span>
            <button
              className="btn-icon ml-auto md:hidden"
              onClick={onClose}
              aria-label="Close menu"
            >
              <Close />
            </button>
          </div>

          <div className="px-2 pb-2">
            <button
              className="flex w-full items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium transition-all hover:border-ink-300 hover:shadow-lift active:scale-[0.99] dark:border-ink-700 dark:bg-ink-800 dark:hover:border-ink-600"
              onClick={onNew}
            >
              <Plus width={15} height={15} /> New conversation
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-1" aria-label="Conversations">
            {loading ? (
              <ListSkeleton rows={4} />
            ) : conversations.length === 0 ? (
              <p className="px-3 py-3 text-xs leading-relaxed text-ink-500">
                Nothing yet. Ask a question to start one.
              </p>
            ) : (
              groups.map(({ label, items }) => (
                <div key={label} className="pb-2">
                  <h2 className="rule py-1.5">{label}</h2>
                  <ul className="space-y-0.5">
                    {items.map((c) => (
                      <ConversationItem
                        key={c.id}
                        conversation={c}
                        active={c.id === currentId}
                        onSelect={onSelect}
                        onChanged={onChanged}
                        onDeleted={onSelectedDeleted}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </nav>

          <div className="max-h-64 shrink-0 overflow-y-auto border-t border-ink-200 px-1 py-2 dark:border-ink-750">
            <h2 className="rule py-1.5">Your documents</h2>
            {documents.loading ? (
              <ListSkeleton rows={2} />
            ) : documents.documents.length === 0 ? (
              <p className="px-3 pb-2 text-xs leading-relaxed text-ink-500">
                Drop a PDF in the chat to search it alongside the statute.
              </p>
            ) : (
              <ul className="space-y-1.5 px-1 pb-1">
                {documents.documents.map((d) => (
                  <DocumentItem key={d.document_id} doc={d} onRemove={documents.remove} />
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-ink-200 px-3 py-2 dark:border-ink-750">
            <span className="text-[11px] text-ink-500">Local session</span>
            <button
              className="btn-icon"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
