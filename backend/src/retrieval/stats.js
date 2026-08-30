import fs from 'node:fs'
import path from 'node:path'
import { config } from '../core/config.js'

const cache = new Map()

function statsPath(name) {
  return path.join(config.corpus.dataDir, `bm25-${name}.json`)
}

export function saveStats(name, stats) {
  fs.mkdirSync(config.corpus.dataDir, { recursive: true })
  fs.writeFileSync(statsPath(name), JSON.stringify(stats))
  cache.set(name, stats)
}

export function loadStats(name) {
  if (cache.has(name)) return cache.get(name)
  const file = statsPath(name)
  if (!fs.existsSync(file)) return null
  const stats = JSON.parse(fs.readFileSync(file, 'utf8'))
  cache.set(name, stats)
  return stats
}

export function clearStatsCache() {
  cache.clear()
}
