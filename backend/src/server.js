import { createApp } from './app.js'
import { config } from './core/config.js'
import { logger } from './core/logger.js'

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'api listening')
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down')
    server.close(() => process.exit(0))
  })
}
