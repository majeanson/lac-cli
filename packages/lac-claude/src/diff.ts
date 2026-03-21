const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'

export interface FieldDiff {
  field: string
  wasEmpty: boolean
  proposed: unknown
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 300 ? value.slice(0, 300) + '…' : value
  }
  return JSON.stringify(value, null, 2)
}

export function printDiff(diffs: FieldDiff[]): void {
  const separator = '━'.repeat(52)

  for (const diff of diffs) {
    const label = diff.wasEmpty ? 'empty → generated' : 'updated'
    process.stdout.write(`\n${BOLD}${CYAN}${separator}${RESET}\n`)
    process.stdout.write(`${BOLD}  ${diff.field}${RESET}  ${DIM}(${label})${RESET}\n`)
    process.stdout.write(`${CYAN}${separator}${RESET}\n`)

    const lines = formatValue(diff.proposed).split('\n')
    for (const line of lines) {
      process.stdout.write(`${GREEN}  ${line}${RESET}\n`)
    }
  }

  process.stdout.write('\n')
}
