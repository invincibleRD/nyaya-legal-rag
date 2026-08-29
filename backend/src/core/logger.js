import pino from 'pino'
import { config } from './config.js'

export const logger = pino({
  level: config.logLevel,
  base: { service: 'nyaya' },
  formatters: {
    level: (label) => ({ level: label }),
  },
})
