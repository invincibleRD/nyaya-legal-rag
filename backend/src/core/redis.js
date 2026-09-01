import Redis from 'ioredis'
import { config } from './config.js'

let client = null

export function redis() {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false })
    client.on('error', () => {})
  }
  return client
}

// commands never time out on this client, so anything that must not block a
// request asks here first and falls back when it gets null
export function redisIfReady() {
  if (!config.redisEnabled) return null
  const r = redis()
  return r.status === 'ready' ? r : null
}

export async function closeRedis() {
  if (client) {
    await client.quit()
    client = null
  }
}
