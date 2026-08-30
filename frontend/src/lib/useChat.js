import { useEffect, useRef, useState } from 'react'
import { getConversation, streamChat } from './api.js'
import { friendly } from './errors.js'

export function useChat({ conversationId, documentIds, onStarted, onFinished }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)

  // the id the stream is writing into, which leads the prop on a brand new conversation
  const ownId = useRef(conversationId)
  const abort = useRef(null)

  useEffect(() => () => abort.current?.abort(), [])

  useEffect(() => {
    if (conversationId === ownId.current) return
    ownId.current = conversationId
    abort.current?.abort()
    setError(null)
    if (!conversationId) {
      setMessages([])
      return
    }
    setLoading(true)
    getConversation(conversationId)
      .then((c) => setMessages((c.messages || []).map((m) => ({ ...m, id: crypto.randomUUID() }))))
      .catch((e) => setError(friendly(e.code, e.message)))
      .finally(() => setLoading(false))
  }, [conversationId])

  const patch = (id, changes) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...changes } : m)))

  async function run(text, replyId) {
    setError(null)
    setStreaming(true)
    const controller = new AbortController()
    abort.current = controller

    try {
      const body = { conversation_id: ownId.current, message: text, document_ids: documentIds }
      for await (const { event, data } of streamChat(body, controller.signal)) {
        if (event === 'meta') {
          if (!ownId.current) {
            ownId.current = data.conversation_id
            onStarted(data.conversation_id)
          }
        } else if (event === 'token') {
          setMessages((ms) =>
            ms.map((m) => (m.id === replyId ? { ...m, content: m.content + data.text } : m))
          )
        } else if (event === 'citations') {
          patch(replyId, { citations: data.citations || [] })
        } else if (event === 'done') {
          patch(replyId, { refused: data.refused })
        } else if (event === 'error') {
          setError(friendly(data.error, data.message))
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') patch(replyId, { stopped: true })
      else setError(friendly(e.code, e.message))
    } finally {
      patch(replyId, { streaming: false })
      setStreaming(false)
      abort.current = null
      onFinished()
    }
  }

  function blankReply() {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      citations: [],
      streaming: true,
    }
  }

  function send(text) {
    if (streaming) return
    const reply = blankReply()
    setMessages((ms) => [...ms, { id: crypto.randomUUID(), role: 'user', content: text }, reply])
    run(text, reply.id)
  }

  function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || streaming) return
    const reply = blankReply()
    setMessages((ms) => {
      const kept = ms[ms.length - 1]?.role === 'assistant' ? ms.slice(0, -1) : ms
      return [...kept, reply]
    })
    run(lastUser.content, reply.id)
  }

  return {
    messages,
    loading,
    streaming,
    error,
    clearError: () => setError(null),
    send,
    regenerate,
    stop: () => abort.current?.abort(),
  }
}
