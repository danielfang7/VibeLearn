import type { CodebaseStoryEntry } from '../../types';
import { html, escHtml } from './shared';

export function getStoryHtml(entries: CodebaseStoryEntry[]): string {
  if (entries.length === 0) {
    return html(`
      <div class="idle">
        <p>No codebase story yet.</p>
        <p class="hint">Debriefs appear after a 10-min session break. Keep coding!</p>
        <button class="secondary" onclick="postMsg('skip')">Back</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        function postMsg(type) { vscode.postMessage({ type }); }
      </script>
    `);
  }

  const entriesHtml = entries
    .map((e) => {
      const date = e.timestamp.slice(0, 10);
      const tags = e.conceptTags.length > 0 ? e.conceptTags.join(', ') : '';
      return `
        <div class="story-entry">
          <div class="story-date">${escHtml(date)}</div>
          <strong>${escHtml(e.title)}</strong>
          <p style="margin-top: 6px;">${escHtml(e.summary)}</p>
          ${tags ? `<div class="tag">Concepts: ${escHtml(tags)}</div>` : ''}
        </div>`;
    })
    .join('');

  return html(`
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;">Codebase Story</h2>
        <button class="secondary" onclick="postMsg('skip')" style="margin:0;">Close</button>
      </div>
      ${entriesHtml}
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function postMsg(type) { vscode.postMessage({ type }); }
    </script>
  `);
}
