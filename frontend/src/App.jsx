import { useCallback, useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import ChatPanel from './panels/ChatPanel.jsx'
import FormsPanel from './panels/FormsPanel.jsx'
import { listConversations } from './lib/api.js'
import { useDocuments } from './lib/useDocuments.js'
import { useTheme } from './lib/theme.js'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [tab, setTab] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [conversations, setConversations] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [currentId, setCurrentId] = useState(null)
  const [resetCount, setResetCount] = useState(0)
  const docs = useDocuments()

  const refreshConversations = useCallback(
    () =>
      listConversations()
        .then((r) => setConversations(r.conversations || []))
        .catch(() => {})
        .finally(() => setLoadingConversations(false)),
    []
  )

  useEffect(() => {
    refreshConversations()
  }, [refreshConversations])

  function openConversation(id) {
    setCurrentId(id)
    setTab('chat')
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        collapsed={collapsed}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        loading={loadingConversations}
        currentId={currentId}
        onSelect={openConversation}
        onNew={() => {
          setResetCount((n) => n + 1)
          openConversation(null)
        }}
        onChanged={refreshConversations}
        onSelectedDeleted={() => setCurrentId(null)}
        documents={docs}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          tab={tab}
          onTab={setTab}
          onMenu={() => setSidebarOpen(true)}
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((c) => !c)}
        />
        {tab === 'chat' ? (
          <ChatPanel
            key={resetCount}
            conversationId={currentId}
            onStarted={(id) => {
              setCurrentId(id)
              refreshConversations()
            }}
            onFinished={refreshConversations}
            documents={docs}
          />
        ) : (
          <FormsPanel />
        )}
      </div>
    </div>
  )
}
