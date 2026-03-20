import { FeatureSchema } from './schema'
import type { Feature } from './types'

export type ValidateFeatureResult =
  | { success: true; data: Feature }
  | { success: false; errors: string[] }

export function validateFeature(data: unknown): ValidateFeatureResult {
  const result = FeatureSchema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  })

  return { success: false, errors }
}
