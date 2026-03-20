import type { z } from 'zod'

import type { FeatureSchema, FeatureStatusSchema } from './schema'

export type Feature = z.infer<typeof FeatureSchema>

export type FeatureStatus = z.infer<typeof FeatureStatusSchema>
