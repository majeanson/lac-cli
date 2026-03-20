/**
 * Minimal markdown → HTML converter for use in the static site generator.
 * Handles the subset of markdown used in feature.json documentation fields:
 * headings, code blocks, inline code, bold, tables, lists, and paragraphs.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMarkdown(text: string): string {
  return (
    escapeHtml(text)
      // **bold**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // `inline code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // [text](url) — allow balanced parentheses inside the URL so that
      // links like https://en.wikipedia.org/wiki/X_(Y) parse correctly.
      .replace(/\[([^\]]+)\]\(((?:[^()]*|\([^()]*\))*)\)/g, '<a href="$2">$1</a>')
  )
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|')
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|/.test(line.trim())
}

function renderTableRow(line: string, isHeader: boolean): string {
  const cells = line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim())
  const tag = isHeader ? 'th' : 'td'
  return `<tr>${cells.map((c) => `<${tag}>${inlineMarkdown(c)}</${tag}>`).join('')}</tr>`
}

export function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // ── Fenced code block ────────────────────────────────────────────────────
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      // Guard against an unmatched opening fence: if we reach EOF without
      // finding the closing ```, treat everything collected so far as the block.
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '')
        i++
      }
      if (i < lines.length) i++ // skip closing ``` only if it exists
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      out.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    // ── Headings ─────────────────────────────────────────────────────────────
    if (line.startsWith('### ')) {
      out.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`)
      i++
      continue
    }
    if (line.startsWith('## ')) {
      out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`)
      i++
      continue
    }
    if (line.startsWith('# ')) {
      out.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`)
      i++
      continue
    }

    // ── Horizontal rule ──────────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      out.push('<hr />')
      i++
      continue
    }

    // ── Table ─────────────────────────────────────────────────────────────────
    if (isTableRow(line)) {
      const tableRows: string[] = []
      let firstRow = true
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        const current = lines[i] ?? ''
        if (isTableSeparator(current)) {
          // separator row — skip
          i++
          continue
        }
        tableRows.push(renderTableRow(current, firstRow))
        if (firstRow) firstRow = false
        i++
      }
      out.push(
        `<table class="md-table"><thead>${tableRows[0] ?? ''}</thead><tbody>${tableRows.slice(1).join('')}</tbody></table>`,
      )
      continue
    }

    // ── Unordered list ───────────────────────────────────────────────────────
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').slice(2))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // ── Ordered list ─────────────────────────────────────────────────────────
    // Require the marker at the very start of the line (no leading spaces) so
    // that a paragraph starting with e.g. "2026. That was the year…" is NOT
    // treated as a list item.
    if (/^[1-9]\d*\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[1-9]\d*\. /.test(lines[i] ?? '')) {
        items.push(`<li>${inlineMarkdown((lines[i] ?? '').replace(/^[1-9]\d*\. /, ''))}</li>`)
        i++
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    // ── Blank line ────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      i++
      continue
    }

    // ── Paragraph ─────────────────────────────────────────────────────────────
    const paraLines: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !((lines[i] ?? '').startsWith('#')) &&
      !((lines[i] ?? '').startsWith('```')) &&
      !(/^[-*] /.test(lines[i] ?? '')) &&
      !(/^[1-9]\d*\. /.test(lines[i] ?? '')) &&
      !(isTableRow(lines[i] ?? ''))
    ) {
      paraLines.push(lines[i] ?? '')
      i++
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineMarkdown(paraLines.join(' '))}</p>`)
    }
  }

  return out.join('\n')
}
