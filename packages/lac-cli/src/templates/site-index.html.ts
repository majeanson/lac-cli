import type { Feature } from '@life-as-code/feature-schema'
import { css } from './site-style.css.js'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function statusBadge(status: Feature['status']): string {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span>`
}

export function renderIndex(features: Feature[], generatedAt?: Date): string {
  const timestamp = (generatedAt ?? new Date()).toISOString()
  const rows =
    features.length === 0
      ? `<tr><td colspan="4" class="no-results" style="display:table-cell">No features found.</td></tr>`
      : features
          .map(
            (f) => `
    <tr class="feature-row" data-search="${escapeHtml((f.featureKey + ' ' + f.title).toLowerCase())}">
      <td><a href="${escapeHtml(f.featureKey)}.html" class="feature-key">${escapeHtml(f.featureKey)}</a></td>
      <td><a href="${escapeHtml(f.featureKey)}.html">${escapeHtml(f.title)}</a></td>
      <td>${statusBadge(f.status)}</td>
      <td class="problem-excerpt">${escapeHtml(f.problem.slice(0, 100))}${f.problem.length > 100 ? '…' : ''}</td>
    </tr>`,
          )
          .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Feature Provenance</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <h1>Feature Provenance</h1>
    <p style="color:var(--color-text-muted);margin-bottom:1.5rem">${features.length} feature${features.length === 1 ? '' : 's'} tracked</p>

    <div class="search-wrapper">
      <input
        type="search"
        id="search"
        class="search-input"
        placeholder="Search by key or title…"
        aria-label="Search features"
      />
    </div>

    <table class="feature-table" id="feature-table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Title</th>
          <th>Status</th>
          <th>Problem</th>
        </tr>
      </thead>
      <tbody id="feature-tbody">
        ${rows}
        <tr id="no-results-row" style="display:none">
          <td colspan="4" class="no-results" style="display:table-cell;color:var(--color-text-muted);font-style:italic;padding:1.5rem 0.75rem">No features match your search.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <footer style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--color-border);color:var(--color-text-muted);font-size:0.75rem;text-align:right">
    Generated ${escapeHtml(timestamp)}
  </footer>

  <script>
    (function () {
      var input = document.getElementById('search');
      var noResults = document.getElementById('no-results-row');
      if (!input) return;
      input.addEventListener('input', function () {
        var query = input.value.trim().toLowerCase();
        var rows = document.querySelectorAll('#feature-tbody .feature-row');
        var visible = 0;
        rows.forEach(function (row) {
          var search = row.getAttribute('data-search') || '';
          var match = query === '' || search.indexOf(query) !== -1;
          row.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        if (noResults) {
          noResults.style.display = (visible === 0 && query !== '') ? '' : 'none';
        }
      });
    })();
  </script>
</body>
</html>`
}
