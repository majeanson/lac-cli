/**
 * Design tokens matching the LAC static HTML generator aesthetic.
 * Warm dark amber palette with monospace typography.
 */
export const T = {
  bg:          '#12100e',
  bgSidebar:   '#0e0c0a',
  bgCard:      '#1a1714',
  bgHover:     '#201d1a',
  bgActive:    '#251f18',
  border:      '#2a2420',
  borderSoft:  '#221e1b',
  text:        '#e8ddd4',
  textMid:     '#b0a49c',
  textSoft:    '#7a6a5a',
  accent:      '#c4a255',
  accentWarm:  '#e8b865',
  mono:        "'Cascadia Code','Fira Code','JetBrains Mono',Consolas,monospace",
  sans:        "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",

  statusActive:        '#4aad72',
  statusDraft:         '#c4a255',
  statusFrozen:        '#5b82cc',
  statusDeprecated:    '#cc5b5b',
  statusActiveBg:      'rgba(74,173,114,0.12)',
  statusDraftBg:       'rgba(196,162,85,0.12)',
  statusFrozenBg:      'rgba(91,130,204,0.12)',
  statusDeprecatedBg:  'rgba(204,91,91,0.12)',
  statusActiveBdr:     'rgba(74,173,114,0.25)',
  statusDraftBdr:      'rgba(196,162,85,0.25)',
  statusFrozenBdr:     'rgba(91,130,204,0.25)',
  statusDeprecatedBdr: 'rgba(204,91,91,0.25)',
} as const

export function statusColor(status: string): string {
  switch (status) {
    case 'active':     return T.statusActive
    case 'draft':      return T.statusDraft
    case 'frozen':     return T.statusFrozen
    case 'deprecated': return T.statusDeprecated
    default:           return T.textSoft
  }
}

export function statusBg(status: string): string {
  switch (status) {
    case 'active':     return T.statusActiveBg
    case 'draft':      return T.statusDraftBg
    case 'frozen':     return T.statusFrozenBg
    case 'deprecated': return T.statusDeprecatedBg
    default:           return 'transparent'
  }
}

export function statusBorder(status: string): string {
  switch (status) {
    case 'active':     return T.statusActiveBdr
    case 'draft':      return T.statusDraftBdr
    case 'frozen':     return T.statusFrozenBdr
    case 'deprecated': return T.statusDeprecatedBdr
    default:           return T.border
  }
}
