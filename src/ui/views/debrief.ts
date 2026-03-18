import type { Intervention } from '../../types';
import { html, escHtml, renderMarkdown } from './shared';

export function getDebriefHtml(intervention: Intervention): string {
  const tagsJson = JSON.stringify(intervention.conceptTags);

  return html(`
    <div class="intervention">
      <div class="tag">Session Debrief</div>
      <h2>${escHtml(intervention.title)}</h2>
      <div class="narrative">
        <p>${renderMarkdown(intervention.body)}</p>
      </div>
      <div class="actions">
        <button onclick="postMsg('continueDebrief', ${tagsJson})">Continue coding</button>
        <button class="secondary" onclick="postMsg('openStory')">Open Codebase Story</button>
        <button class="secondary" onclick="postMsg('snooze')">Snooze 10 min</button>
      </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function postMsg(type, payload) { vscode.postMessage({ type, payload }); }
    </script>
  `);
}
