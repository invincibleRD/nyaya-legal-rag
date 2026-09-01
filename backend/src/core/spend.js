import { config } from './config.js'
import { redisIfReady } from './redis.js'
import { budgetTrips } from './metrics.js'
import { logger } from './logger.js'

const KEY_TTL = 60 * 60 * 36

// utc day, so the ceiling rolls at a fixed instant rather than drifting with
// whatever timezone the box happens to be in
const key = () => `spend:${new Date().toISOString().slice(0, 10)}`

export async function recordSpend(usd) {
  if (!(usd > 0)) return
  const r = redisIfReady()
  if (!r) return
  try {
    const k = key()
    await r.incrbyfloat(k, usd)
    await r.expire(k, KEY_TTL)
  } catch (err) {
    logger.warn({ err }, 'could not record spend')
  }
}

export async function dailySpend() {
  const r = redisIfReady()
  if (!r) return 0
  try {
    return Number(await r.get(key())) || 0
  } catch {
    return 0
  }
}

// fails open: redis being down should degrade billing visibility, not take the
// service offline. the per ip and concurrency limits still stand in that case.
export async function overDailyBudget() {
  const ceiling = config.cost.dailyCeilingUsd
  if (ceiling <= 0) return false
  const spent = await dailySpend()
  if (spent < ceiling) return false
  budgetTrips.inc()
  logger.error({ spent, ceiling }, 'daily spend ceiling reached, refusing generation')
  return true
}
