import type { Feature } from '@life-as-code/feature-schema'

/** A feature.json that has been loaded, validated, and indexed. */
export interface IndexedFeature {
  /** Parsed, validated Feature object. */
  feature: Feature
  /** Absolute path to the feature.json file on disk. */
  filePath: string
  /** Directory that contains feature.json — used for blame lookups. */
  dir: string
  /** Completeness score 0–100 based on optional field fill rate. */
  completeness: number
}

export type ChangeEventType = 'add' | 'change' | 'delete'

export interface FeatureChangeEvent {
  type: ChangeEventType
  featureKey: string
  filePath: string
  /** Present for 'add' and 'change'; absent for 'delete'. */
  indexed?: IndexedFeature
}
