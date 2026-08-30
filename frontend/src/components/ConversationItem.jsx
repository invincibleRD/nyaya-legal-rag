import { useState } from 'react'
import { deleteConversation, renameConversation } from '../lib/api.js'
import { Check, Close, Pencil, Trash } from './Icons.jsx'

export default function ConversationItem({ conversation, active, onSelect, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const [confirming, setConfirming] = useState(false)

  async function save() {
    setEditing(false)
    if (title.trim() && title !== conversation.title) {
      await renameConversation(conversation.id, title.trim()).catch(() => {})
      onChanged()
    } else {
      setTitle(conversation.title)
    }
  }

  async function remove() {
    await deleteConversation(conversation.id).catch(() => {})
    if (active) onDeleted()
    onChanged()
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1 px-1">
        <input
          className="field py-1 text-sm"
          value={title}
          autoFocus
          aria-label="Conversation title"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setTitle(conversation.title)
              setEditing(false)
            }
          }}
        />
        <button className="btn px-2 py-1" onClick={save} aria-label="Save title">
          <Check width={14} height={14} />
        </button>
      </li>
    )
  }

  return (
    <li className="group relative">
      <button
        onClick={() => onSelect(conversation.id)}
        aria-current={active ? 'page' : undefined}
        className={`w-full truncate rounded-md py-2 pl-2 pr-16 text-left text-sm transition-colors ${
          active
            ? 'bg-ink-100 font-medium dark:bg-ink-700'
            : 'hover:bg-ink-100 dark:hover:bg-ink-700/60'
        }`}
      >
        {conversation.title || 'Untitled'}
      </button>

      <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {confirming ? (
          <>
            <button
              className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={remove}
              aria-label={`Confirm delete ${conversation.title}`}
            >
              <Check width={14} height={14} />
            </button>
            <button
              className="rounded p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
              onClick={() => setConfirming(false)}
              aria-label="Cancel delete"
            >
              <Close width={14} height={14} />
            </button>
          </>
        ) : (
          <>
            <button
              className="rounded p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${conversation.title}`}
            >
              <Pencil width={14} height={14} />
            </button>
            <button
              className="rounded p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${conversation.title}`}
            >
              <Trash width={14} height={14} />
            </button>
          </>
        )}
      </div>
    </li>
  )
}
