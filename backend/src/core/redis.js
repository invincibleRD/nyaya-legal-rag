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

export async function closeRedis() {
  if (client) {
    await client.quit()
    client = null
  }
}
