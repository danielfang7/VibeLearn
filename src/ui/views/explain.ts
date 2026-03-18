import type { Intervention } from '../../types';
import { html, escHtml, renderMarkdown } from './shared';

export function getExplainHtml(intervention: Intervention): string {
  return html(`
    <div class="intervention">
      <div class="tag">Codebase Explained</div>
      <h2>${escHtml(intervention.title)}</h2>
      <div class="section-body">${renderMarkdown(intervention.body)}</div>
      <div class="actions">
        <button onclick="postMsg('skip')">Done</button>
        <button class="secondary" onclick="postMsg('quizNow')">Quiz Me Now</button>
      </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function postMsg(type) { vscode.postMessage({ type }); }
    </script>
  `);
}
