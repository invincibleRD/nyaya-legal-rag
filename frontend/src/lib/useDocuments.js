import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDocument, documentStatus, listDocuments, uploadDocument } from './api.js'
import { friendly } from './errors.js'

export const STAGES = ['parsing', 'chunking', 'embedding', 'ready']
const PENDING = ['queued', 'parsing', 'chunking', 'embedding']
const MAX_BYTES = 25 * 1024 * 1024

export function useDocuments() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timers = useRef(new Map())

  const poll = useCallback((id) => {
    const tick = async () => {
      try {
        const s = await documentStatus(id)
        setDocuments((docs) => docs.map((d) => (d.document_id === id ? { ...d, ...s } : d)))
        if (PENDING.includes(s.status)) timers.current.set(id, setTimeout(tick, 1200))
        else timers.current.delete(id)
      } catch {
        timers.current.delete(id)
      }
    }
    tick()
  }, [])

  useEffect(() => {
    listDocuments()
      .then((r) => {
        const docs = r.documents || []
        setDocuments(docs)
        docs.filter((d) => PENDING.includes(d.status)).forEach((d) => poll(d.document_id))
      })
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false))
    const running = timers.current
    return () => running.forEach(clearTimeout)
  }, [poll])

  const upload = useCallback(
    async (file) => {
      setError(null)
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError(`${file.name} is not a PDF.`)
        return
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 25 MB.`)
        return
      }
      const temp = {
        document_id: `pending-${file.name}`,
        filename: file.name,
        status: 'queued',
        progress: 0,
        pending: true,
      }
      setDocuments((docs) => [...docs, temp])
      try {
        const created = await uploadDocument(file)
        setDocuments((docs) =>
          docs.map((d) => (d.document_id === temp.document_id ? { ...created, progress: 0 } : d))
        )
        poll(created.document_id)
      } catch (e) {
        setDocuments((docs) => docs.filter((d) => d.document_id !== temp.document_id))
        setError(friendly(e.code, e.message))
      }
    },
    [poll]
  )

  const remove = useCallback(async (id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setDocuments((docs) => docs.filter((d) => d.document_id !== id))
    await deleteDocument(id).catch(() => {})
  }, [])

  return { documents, loading, error, clearError: () => setError(null), upload, remove }
}
