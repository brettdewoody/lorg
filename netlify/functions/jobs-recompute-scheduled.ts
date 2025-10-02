
import type { Handler } from '@netlify/functions'

// Example scheduled task: vacuum/analyze or recompute simplifications nightly
export const handler: Handler = async () => {
  console.warn('Nightly maintenance (stub)')
  return { statusCode: 200, body: 'ok' }
}
