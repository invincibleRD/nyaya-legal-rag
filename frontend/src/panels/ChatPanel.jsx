import { useCallback, useEffect, useRef, useState } from 'react'
import Composer from '../components/Composer.jsx'
import DocumentItem from '../components/DocumentItem.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorNotice from '../components/ErrorNotice.jsx'
import MessageList from '../components/MessageList.jsx'
import SourceDrawer from '../components/SourceDrawer.jsx'
import { MessagesSkeleton } from '../components/Skeletons.jsx'
import { Upload } from '../components/Icons.jsx'
import { useChat } from '../lib/useChat.js'

export default function ChatPanel({ conversationId, onStarted, onFinished, documents }) {
  const [source, setSource] = useState(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const ready = documents.documents.filter((d) => d.status === 'ready')
  const chat = useChat({
    conversationId,
    documentIds: ready.map((d) => d.document_id),
    onStarted,
    onFinished,
  })

  useEffect(() => setSource(null), [conversationId])

  const openSource = useCallback((citation) => setSource(citation), [])

  function onDrop(e) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    Array.from(e.dataTransfer.files).forEach((f) => documents.upload(f))
  }

  const busyDocs = documents.documents.filter((d) => d.status !== 'ready')

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={(e) => {
          e.preventDefault()
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1
          if (dragDepth.current <= 0) setDragging(false)
        }}
        onDrop={onDrop}
      >
        {chat.loading ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessagesSkeleton />
          </div>
        ) : chat.messages.length === 0 ? (
          <EmptyState onPick={chat.send} />
        ) : (
          <MessageList
            messages={chat.messages}
            onOpenCitation={openSource}
            activeMarker={source?.marker}
            onRegenerate={chat.regenerate}
            streaming={chat.streaming}
          />
        )}

        <p className="sr-only" role="status">
          {chat.streaming ? 'Generating an answer' : ''}
        </p>

        {(documents.error || chat.error || busyDocs.length > 0) && (
          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-2 px-3 pb-1">
            {documents.error && (
              <ErrorNotice onDismiss={documents.clearError}>{documents.error}</ErrorNotice>
            )}
            {chat.error && (
              <ErrorNotice
                onDismiss={chat.clearError}
                onRetry={chat.messages.length ? chat.regenerate : undefined}
              >
                {chat.error}
              </ErrorNotice>
            )}
            {busyDocs.length > 0 && (
              <ul className="space-y-1.5" aria-live="polite">
                {busyDocs.map((d) => (
                  <DocumentItem key={d.document_id} doc={d} />
                ))}
              </ul>
            )}
          </div>
        )}

        <Composer
          onSend={chat.send}
          onStop={chat.stop}
          streaming={chat.streaming}
          onFiles={(files) => files.forEach((f) => documents.upload(f))}
          scopeCount={ready.length}
        />

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-20 flex animate-fadeIn flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-brass-400 bg-ink-50/90 backdrop-blur-sm dark:bg-ink-900/90">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brass-500/15 text-brass-600 dark:text-brass-400">
              <Upload width={22} height={22} />
            </span>
            <p className="text-sm font-medium">Drop a PDF to add it to this session</p>
          </div>
        )}
      </div>

      {source && <SourceDrawer citation={source} onClose={() => setSource(null)} />}
    </div>
  )
}
