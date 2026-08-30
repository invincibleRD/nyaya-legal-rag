import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { config } from '../core/config.js'
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from '../core/store.js'
import { enqueueIngest } from '../workers/queue.js'
import { purgeDocument } from '../ingestion/document.js'

export const documents = Router()

const uploadDir = () => path.join(config.corpus.dataDir, 'uploads')

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = uploadDir()
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (req, file, cb) => cb(null, `${req.sessionId}-${Date.now()}-${safeName(file)}`),
  }),
  limits: { fileSize: config.limits.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(Object.assign(new Error('only pdf uploads are accepted'), { code: 'BAD_TYPE' }))
    }
    cb(null, true)
  },
})

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.limits.uploadPerHour,
  keyGenerator: (req) => req.sessionId,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'rate_limited', message: 'too many uploads this hour' }),
})

documents.post('/documents/upload', limiter, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(uploadStatus(err)).json(uploadError(err))
    if (!req.file) {
      return res.status(400).json({ error: 'validation_error', message: 'a file is required' })
    }

    // trust the bytes, not the header the client sent
    if (!looksLikePdf(req.file.path)) {
      fs.rmSync(req.file.path, { force: true })
      return res
        .status(415)
        .json({ error: 'unsupported_media_type', message: 'that file is not a pdf' })
    }

    const doc = await createDocument(req.sessionId, {
      filename: req.file.originalname,
      path: req.file.path,
      bytes: String(req.file.size),
    })

    const jobId = await enqueueIngest({
      documentId: doc.id,
      sessionId: req.sessionId,
      filePath: req.file.path,
      filename: req.file.originalname,
    })
    await updateDocument(doc.id, { job_id: String(jobId) })

    res.status(202).json({
      document_id: doc.id,
      job_id: String(jobId),
      filename: doc.filename,
      status: 'queued',
    })
  })
})

documents.get('/documents', async (req, res) => {
  res.json({ documents: (await listDocuments(req.sessionId)).map(publicDoc) })
})

documents.get('/documents/:id/status', async (req, res) => {
  const doc = await getDocument(req.params.id, req.sessionId)
  if (!doc) return res.status(404).json({ error: 'not_found', message: 'no such document' })
  res.json({
    document_id: doc.id,
    status: doc.status,
    progress: Number(doc.progress || 0),
    pages: doc.pages ? Number(doc.pages) : null,
    chunks: doc.chunks ? Number(doc.chunks) : null,
    error: doc.error || null,
  })
})

documents.delete('/documents/:id', async (req, res) => {
  const doc = await deleteDocument(req.params.id, req.sessionId)
  if (!doc) return res.status(404).json({ error: 'not_found', message: 'no such document' })

  await purgeDocument({ documentId: doc.id, sessionId: req.sessionId })
  if (doc.path) fs.rmSync(doc.path, { force: true })
  res.status(204).end()
})

function publicDoc(doc) {
  return {
    id: doc.id,
    filename: doc.filename,
    status: doc.status,
    progress: Number(doc.progress || 0),
    pages: doc.pages ? Number(doc.pages) : null,
    chunks: doc.chunks ? Number(doc.chunks) : null,
    bytes: Number(doc.bytes || 0),
    created_at: doc.created_at,
  }
}

function safeName(file) {
  return file.originalname.replace(/[^\w.-]/g, '_').slice(-80)
}

// %PDF at the top, anything else is mislabelled whatever the client claimed
function looksLikePdf(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const head = Buffer.alloc(5)
    fs.readSync(fd, head, 0, 5, 0)
    return head.toString('latin1') === '%PDF-'
  } finally {
    fs.closeSync(fd)
  }
}

function uploadStatus(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return 413
  if (err.code === 'BAD_TYPE') return 415
  return 400
}

function uploadError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return {
      error: 'payload_too_large',
      message: `that file is over the ${config.limits.maxUploadMb}MB limit`,
    }
  }
  if (err.code === 'BAD_TYPE') {
    return { error: 'unsupported_media_type', message: err.message }
  }
  return { error: 'validation_error', message: err.message }
}
