import fs from 'node:fs'
import path from 'node:path'

const LAC_DIR = '.lac'
const COUNTER_FILE = 'counter'
const KEYS_FILE = 'keys'

/**
 * Returns the current year as a number.
 */
export function getCurrentYear(): number {
  return new Date().getFullYear()
}

/**
 * Pads a counter number to a zero-padded 3-digit string (e.g. 1 → "001").
 */
export function padCounter(n: number): string {
  return String(n).padStart(3, '0')
}

/**
 * Walks up the directory tree from `fromDir` to find the nearest `.lac/` directory.
 * Returns the path to the `.lac/` directory if found, otherwise null.
 */
function findLacDir(fromDir: string): string | null {
  let current = path.resolve(fromDir)

  while (true) {
    const candidate = path.join(current, LAC_DIR)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }

    const parent = path.dirname(current)
    if (parent === current) {
      // Reached filesystem root without finding .lac/
      return null
    }
    current = parent
  }
}

/**
 * Reads or initialises the `.lac/counter` file and returns the next
 * featureKey string like "feat-2026-001".
 *
 * The counter file stores a single integer representing the last-used counter
 * for the current year.  When the year changes the counter resets to 1.
 *
 * Format of the counter file (two lines):
 *   <year>
 *   <last-used-counter>
 *
 * If the file does not exist it is created, and the first key (NNN=001) is
 * returned.  The `.lac/` directory must already exist in a parent of
 * `fromDir`; if it cannot be found this function throws an Error.
 *
 * Duplicate detection: after generating the key, the `.lac/keys` file is
 * consulted. If the generated key already exists there, the counter is
 * incremented until a unique key is found.
 *
 * @param prefix  Domain prefix for the key (default: "feat"). Set via `domain`
 *                in `lac.config.json` to get keys like "proc-2026-001".
 */
export function generateFeatureKey(fromDir: string, prefix = 'feat'): string {
  const lacDir = findLacDir(fromDir)

  if (!lacDir) {
    throw new Error(
      `Could not find a .lac/ directory in "${fromDir}" or any of its parents. ` +
        'Run "lac workspace init" to initialise a life-as-code workspace.',
    )
  }

  const counterPath = path.join(lacDir, COUNTER_FILE)
  const keysPath = path.join(lacDir, KEYS_FILE)
  const year = getCurrentYear()

  let counter = 1

  if (fs.existsSync(counterPath)) {
    try {
      const raw = fs.readFileSync(counterPath, 'utf-8').trim()
      const lines = raw.split('\n').map((l) => l.trim())

      const storedYear = parseInt(lines[0] ?? '', 10)
      const storedCounter = parseInt(lines[1] ?? '', 10)

      if (isNaN(storedYear) || isNaN(storedCounter)) {
        // Corrupt counter file — reset to 1
        process.stderr.write('Warning: .lac/counter was corrupt — reset to 1\n')
        fs.writeFileSync(counterPath, `${year}\n1\n`, 'utf-8')
        counter = 1
      } else if (storedYear === year) {
        counter = storedCounter + 1
      }
      // If year differs, counter resets to 1 (already set above)
    } catch {
      // Unreadable — treat as fresh counter
      process.stderr.write('Warning: .lac/counter was corrupt — reset to 1\n')
      fs.writeFileSync(counterPath, `${year}\n1\n`, 'utf-8')
      counter = 1
    }
  }

  // Load existing keys for duplicate detection
  let existingKeys: Set<string> = new Set()
  if (fs.existsSync(keysPath)) {
    existingKeys = new Set(
      fs.readFileSync(keysPath, 'utf-8').trim().split('\n').filter(Boolean),
    )
  }

  // If duplicate, keep incrementing until we find a unique key
  while (existingKeys.has(`${prefix}-${year}-${padCounter(counter)}`)) {
    counter++
  }

  const featureKey = `${prefix}-${year}-${padCounter(counter)}`

  // Persist counter and keys atomically: write to temp files first, then
  // rename into place so a crash between the two writes cannot corrupt state.
  existingKeys.add(featureKey)

  const counterTmp = counterPath + '.tmp'
  const keysTmp = keysPath + '.tmp'
  fs.writeFileSync(counterTmp, `${year}\n${counter}\n`, 'utf-8')
  fs.writeFileSync(keysTmp, Array.from(existingKeys).join('\n') + '\n', 'utf-8')
  fs.renameSync(counterTmp, counterPath)
  fs.renameSync(keysTmp, keysPath)

  return featureKey
}
