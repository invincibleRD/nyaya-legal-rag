import { createApp } from './app.js'
import { config } from './core/config.js'
import { logger } from './core/logger.js'
import { redis } from './core/redis.js'

// connect at boot, so the first requests are already counted in the shared
// limiter store rather than each replica's in-process fallback
if (config.redisEnabled) redis()

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'api listening')
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down')
    server.close(() => process.exit(0))
  })
}
