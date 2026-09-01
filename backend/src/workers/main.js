import { Worker } from 'bullmq'
import { QUEUE_NAME, connection } from './queue.js'
import { ingestDocument } from '../ingestion/document.js'
import { updateDocument } from '../core/store.js'
import { closeRedis } from '../core/redis.js'
import { logger } from '../core/logger.js'

const CONCURRENCY = 2

async function runJob(job) {
  const { documentId, sessionId, filePath, filename } = job.data
  const log = logger.child({ jobId: job.id, documentId, sessionId })
  log.info({ filename }, 'ingest started')

  try {
    const result = await ingestDocument({
      documentId,
      sessionId,
      filePath,
      filename,
      onProgress: (stage, fraction) =>
        updateDocument(documentId, {
          status: stage,
          progress: String(Math.round(fraction * 100) / 100),
        }),
    })

    await updateDocument(documentId, {
      status: 'ready',
      progress: '1',
      pages: String(result.pages),
      chunks: String(result.chunks),
      error: '',
    })
    log.info(result, 'ingest done')
    return result
  } catch (err) {
    // a retry sets the status back to parsing, so failed is never sticky
    await updateDocument(documentId, { status: 'failed', progress: '0', error: err.message })
    log.error({ err: err.message }, 'ingest failed')
    throw err
  }
}

const worker = new Worker(QUEUE_NAME, runJob, { connection, concurrency: CONCURRENCY })

worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'))

logger.info({ queue: QUEUE_NAME, concurrency: CONCURRENCY }, 'ingest worker up')

let closing = false

async function shutdown(signal) {
  if (closing) return
  closing = true
  logger.info({ signal }, 'draining ingest worker')
  await worker.close()
  await closeRedis()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
