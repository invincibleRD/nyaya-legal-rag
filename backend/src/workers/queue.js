import { Queue } from 'bullmq'
import { config } from '../core/config.js'

export const QUEUE_NAME = 'ingest'

// bullmq blocks on its own connection, so it never shares the store's client
export const connection = { url: config.redisUrl, maxRetriesPerRequest: null }

let queue = null

export function ingestQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    })
  }
  return queue
}

export async function enqueueIngest(job) {
  const added = await ingestQueue().add('document', job)
  return added.id
}
