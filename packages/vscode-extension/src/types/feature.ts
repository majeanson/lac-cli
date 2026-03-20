export type FeatureStatus = 'draft' | 'active' | 'frozen' | 'deprecated'

export interface Decision {
  decision: string
  rationale: string
  alternativesConsidered?: string[]
  date?: string
}

export interface Annotation {
  id: string
  author: string
  date: string
  type: 'decision' | 'warning' | 'assumption' | 'lesson'
  body: string
}

export interface Lineage {
  parent?: string | null
  children?: string[]
  spawnReason?: string | null
}

export interface Feature {
  featureKey: string
  title: string
  status: FeatureStatus
  problem: string
  analysis?: string
  decisions?: Decision[]
  implementation?: string
  knownLimitations?: string[]
  tags?: string[]
  annotations?: Annotation[]
  lineage?: Lineage
}

export function isValidFeature(data: unknown): data is Feature {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d['featureKey'] === 'string' &&
    typeof d['title'] === 'string' &&
    typeof d['status'] === 'string' &&
    ['draft', 'active', 'frozen', 'deprecated'].includes(d['status'] as string) &&
    typeof d['problem'] === 'string'
  )
}
