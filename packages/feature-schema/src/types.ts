import type { z } from 'zod'

import type { FeatureSchema, FeatureStatusSchema, RevisionSchema, PublicInterfaceEntrySchema, CodeSnippetSchema, FieldLockSchema } from './schema'

export type Feature = z.infer<typeof FeatureSchema>

export type FeatureStatus = z.infer<typeof FeatureStatusSchema>

export type Revision = z.infer<typeof RevisionSchema>

export type PublicInterfaceEntry = z.infer<typeof PublicInterfaceEntrySchema>

export type CodeSnippet = z.infer<typeof CodeSnippetSchema>

export type FieldLock = z.infer<typeof FieldLockSchema>
