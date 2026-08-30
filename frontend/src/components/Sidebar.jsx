import { useEffect } from 'react'
import ConversationItem from './ConversationItem.jsx'
import DocumentItem from './DocumentItem.jsx'
import { ListSkeleton } from './Skeletons.jsx'
import { Close, Moon, Plus, Sun } from './Icons.jsx'

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
}) {
  useEffect(() => {
    if (!open) return
    function esc(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-ink-200 bg-white transition-[transform,visibility] duration-200 dark:border-ink-700 dark:bg-ink-800 md:visible md:static md:translate-x-0 ${
          open ? 'translate-x-0' : 'invisible -translate-x-full'
        }`}
        aria-label="Conversations and documents"
      >
        <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-3 dark:border-ink-700">
          <span className="font-serif text-lg font-semibold tracking-tight">Nyaya</span>
          <span className="rounded bg-brass-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brass-600 dark:text-brass-400">
            BNSS
          </span>
          <button className="btn ml-auto px-2 md:hidden" onClick={onClose} aria-label="Close menu">
            <Close />
          </button>
        </div>

        <div className="p-2">
          <button className="btn btn-primary w-full" onClick={onNew}>
            <Plus /> New conversation
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-1" aria-label="Conversations">
          <h2 className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-700 dark:text-ink-100/50">
            Conversations
          </h2>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-ink-700 dark:text-ink-100/50">
              Nothing yet. Ask a question to start one.
            </p>
          ) : (
            <ul className="space-y-0.5 pb-2">
              {conversations.map((c) => (
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
          )}
        </nav>

        <div className="max-h-64 shrink-0 overflow-y-auto border-t border-ink-200 px-1 py-2 dark:border-ink-700">
          <h2 className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-700 dark:text-ink-100/50">
            Your documents
          </h2>
          {documents.loading ? (
            <ListSkeleton rows={2} />
          ) : documents.documents.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-ink-700 dark:text-ink-100/50">
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

        <div className="flex items-center justify-between border-t border-ink-200 px-3 py-2 dark:border-ink-700">
          <span className="text-[11px] text-ink-700 dark:text-ink-100/50">Local session</span>
          <button
            className="btn px-2 py-1"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </div>
      </aside>
    </>
  )
}
