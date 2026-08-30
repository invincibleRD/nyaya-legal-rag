import { config } from '../core/config.js'

export function estimateCost(usage) {
  const input = usage?.input_tokens || 0
  const output = usage?.output_tokens || 0
  const usd = (input * config.cost.per1mInput + output * config.cost.per1mOutput) / 1e6
  return Number(usd.toFixed(6))
}

export function sumUsage(...parts) {
  return parts.filter(Boolean).reduce(
    (total, u) => ({
      input_tokens: total.input_tokens + (u.input_tokens || 0),
      output_tokens: total.output_tokens + (u.output_tokens || 0),
    }),
    { input_tokens: 0, output_tokens: 0 }
  )
}
