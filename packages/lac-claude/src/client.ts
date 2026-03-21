import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import Anthropic from '@anthropic-ai/sdk'

export function createClient(): Anthropic {
  let apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    const configPath = findLacConfig()
    if (configPath) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
          ai?: { apiKey?: string }
        }
        apiKey = config?.ai?.apiKey
      } catch {
        // ignore
      }
    }
  }

  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set.\n' +
        'Set it via:\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...\n' +
        'Or add it to .lac/config.json:\n' +
        '  { "ai": { "apiKey": "sk-ant-..." } }\n' +
        'Get a key at https://console.anthropic.com/settings/keys',
    )
  }

  return new Anthropic({ apiKey })
}

function findLacConfig(): string | null {
  let current = process.cwd()
  while (true) {
    const candidate = path.join(current, '.lac', 'config.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export async function generateText(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  model = 'claude-sonnet-4-6',
): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = message.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API')
  }
  return content.text
}
