export const css = `
:root {
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-border: #dee2e6;
  --color-text: #212529;
  --color-text-muted: #6c757d;
  --color-link: #0d6efd;
  --color-link-hover: #0a58ca;
  --color-active: #198754;
  --color-draft: #6c757d;
  --color-frozen: #0d6efd;
  --color-deprecated: #dc3545;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a2e;
    --color-surface: #16213e;
    --color-border: #374151;
    --color-text: #e9ecef;
    --color-text-muted: #9ca3af;
    --color-link: #60a5fa;
    --color-link-hover: #93c5fd;
    --color-active: #4ade80;
    --color-draft: #9ca3af;
    --color-frozen: #60a5fa;
    --color-deprecated: #f87171;
  }
}

*, *::before, *::after {
  box-sizing: border-box;
}

html {
  font-size: 16px;
  line-height: 1.6;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: var(--color-bg);
  color: var(--color-text);
  margin: 0;
  padding: 0;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 0.5rem;
}

h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.25rem;
}

a {
  color: var(--color-link);
  text-decoration: none;
}

a:hover {
  color: var(--color-link-hover);
  text-decoration: underline;
}

p {
  margin: 0 0 1rem;
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.feature-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New', monospace;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

/* Status badges */
.status-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-active {
  color: var(--color-active);
  background-color: color-mix(in srgb, var(--color-active) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-active) 30%, transparent);
}

.status-draft {
  color: var(--color-draft);
  background-color: color-mix(in srgb, var(--color-draft) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-draft) 30%, transparent);
}

.status-frozen {
  color: var(--color-frozen);
  background-color: color-mix(in srgb, var(--color-frozen) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-frozen) 30%, transparent);
}

.status-deprecated {
  color: var(--color-deprecated);
  background-color: color-mix(in srgb, var(--color-deprecated) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-deprecated) 30%, transparent);
}

/* Search */
.search-wrapper {
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--color-link);
}

/* Feature table */
.feature-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.feature-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.feature-table td {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.feature-table tr:last-child td {
  border-bottom: none;
}

.feature-table tr:hover td {
  background-color: var(--color-surface);
}

.problem-excerpt {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

/* Sections */
section {
  margin-bottom: 2rem;
}

.problem-text {
  background-color: var(--color-surface);
  border-left: 3px solid var(--color-link);
  padding: 1rem 1.25rem;
  border-radius: 0 0.375rem 0.375rem 0;
  margin: 0;
}

/* Decisions timeline */
ol.decisions {
  list-style: none;
  padding: 0;
  margin: 0;
}

ol.decisions li {
  position: relative;
  padding: 1rem 1rem 1rem 1.5rem;
  border-left: 2px solid var(--color-border);
  margin-bottom: 1rem;
}

ol.decisions li:last-child {
  margin-bottom: 0;
}

ol.decisions li::before {
  content: '';
  position: absolute;
  left: -0.375rem;
  top: 1.25rem;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background-color: var(--color-link);
}

.decision-date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: 0.25rem;
}

.decision-text {
  font-weight: 600;
  margin-bottom: 0.375rem;
}

.decision-rationale {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
  margin-bottom: 0.375rem;
}

.alternatives {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.alternatives span {
  font-weight: 500;
}

/* Implementation / limitation sections */
.implementation-text {
  white-space: pre-wrap;
  font-size: 0.9375rem;
  line-height: 1.7;
}

ul.limitations {
  padding-left: 1.5rem;
  margin: 0;
}

ul.limitations li {
  margin-bottom: 0.375rem;
  color: var(--color-text-muted);
}

/* Lineage */
.lineage-info {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 1rem 1.25rem;
}

.lineage-info p {
  margin-bottom: 0.5rem;
}

.lineage-info p:last-child {
  margin-bottom: 0;
}

/* Back link */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 2rem;
  font-size: 0.875rem;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text-muted);
}

/* No results row */
.no-results {
  display: none;
  padding: 1.5rem 0.75rem;
  color: var(--color-text-muted);
  font-style: italic;
}

/* Markdown-rendered content */
.implementation-text h2,
.analysis-text h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-top: 1.75rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.25rem;
}

.implementation-text h3,
.analysis-text h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 1.25rem;
  margin-bottom: 0.375rem;
  color: var(--color-text-muted);
}

.implementation-text pre,
.analysis-text pre {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 1rem 0;
}

.implementation-text code,
.analysis-text code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
}

.implementation-text pre code,
.analysis-text pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.875rem;
}

.implementation-text :not(pre) > code,
.analysis-text :not(pre) > code {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
}

.implementation-text ul,
.analysis-text ul,
.implementation-text ol,
.analysis-text ol {
  padding-left: 1.5rem;
  margin: 0.5rem 0 1rem;
}

.implementation-text li,
.analysis-text li {
  margin-bottom: 0.25rem;
}

/* Markdown tables */
.md-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9rem;
}

.md-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--color-border);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.md-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.md-table tr:last-child td {
  border-bottom: none;
}

.md-table tr:hover td {
  background-color: var(--color-surface);
}

/* Analysis section */
.analysis-text {
  font-size: 0.9375rem;
  line-height: 1.7;
}
`
