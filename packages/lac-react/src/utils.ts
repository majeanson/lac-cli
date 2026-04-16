/**
 * Shared utilities for lac-react components.
 */

/** Escape HTML special chars */
export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Minimal markdown → HTML renderer matching the LAC HTML generator style.
 * Warm dark token colours baked into inline styles.
 */
export function mdToHtml(md: string): string {
  if (!md) return ''
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm,
      `<h3 style="font-size:12px;font-weight:600;color:#e8ddd4;margin:14px 0 4px;letter-spacing:0.04em">$1</h3>`)
    .replace(/^## (.+)$/gm,
      `<h2 style="font-size:13px;font-weight:700;color:#e8b865;margin:16px 0 6px;letter-spacing:0.04em">$1</h2>`)
    .replace(/^# (.+)$/gm,
      `<h1 style="font-size:16px;font-weight:700;color:#e8ddd4;margin:18px 0 8px">$1</h1>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e8ddd4;font-weight:600">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:#b0a49c">$1</em>')
    .replace(/`(.+?)`/g,
      `<code style="background:#1a1714;padding:1px 5px;border-radius:3px;font-size:11px;color:#c4a255;border:1px solid #2a2420">$1</code>`)
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;color:#b0a49c">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="padding-left:18px;margin:8px 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:8px 0;color:#b0a49c;line-height:1.65">')
    .replace(/\n/g, ' ')
    .trim()
}

/**
 * Wraps occurrences of `query` in amber `<mark>` tags.
 * Input is plain text; output is HTML-safe.
 */
export function highlight(text: string, query: string): string {
  if (!query || !text) return escHtml(text)
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escHtml(text).replace(
    new RegExp(esc, 'gi'),
    m => `<mark style="background:rgba(196,162,85,0.3);color:#e8b865;border-radius:2px;padding:0 1px">${m}</mark>`,
  )
}
