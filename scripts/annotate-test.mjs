import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'

const [userId, fixturesArg] = process.argv.slice(2)
if (!userId) {
  console.log('Usage: npm run annotate:test -- <user-id> [fixturesDir]')
  process.exit(1)
}

const fixturesDir = path.resolve(fixturesArg ?? 'fixtures/strava')
if (!fs.existsSync(fixturesDir)) {
  console.error(`[annotate-test] fixtures directory not found: ${fixturesDir}`)
  process.exit(1)
}

const files = fs.readdirSync(fixturesDir, { withFileTypes: true })
const ids = files
  .filter((entry) => entry.isFile() && entry.name.endsWith('-summary.json'))
  .map((entry) => Number(entry.name.replace('-summary.json', '')))
  .filter((id) => Number.isFinite(id))
  .sort((a, b) => a - b)

console.log(`Would annotate for user ${userId}`)
console.log(ids.slice(0, 20))
