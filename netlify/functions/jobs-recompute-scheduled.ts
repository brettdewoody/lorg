import type { Handler } from '@netlify/functions'

// Example scheduled task: vacuum/analyze or recompute simplifications nightly
export const handler: Handler = () => {
  console.warn('Nightly maintenance (stub)')
  return Promise.resolve({ statusCode: 200, body: 'ok' })
}
