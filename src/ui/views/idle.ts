import { html, escHtml } from './shared';

export function getIdleHtml(storyEntryCount = 0): string {
  const storyHint = storyEntryCount > 0
    ? `<button class="secondary" onclick="postMsg('openStory')" style="margin-top:8px;width:100%">View Codebase Story (${storyEntryCount} entries)</button>`
    : '';

  return html(`
    <div class="idle">
      <p>Coding away — VibeLearn is watching.</p>
      <p class="hint">Quizzes appear every 10 prompts. Debriefs appear after a 10-min break.</p>
      <button onclick="postMsg('quizNow')">Quiz Me Now</button>
      <button class="secondary" onclick="postMsg('explainCodebase')">Explain My Codebase</button>
      ${storyHint}
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function postMsg(type, payload) { vscode.postMessage({ type, payload }); }
    </script>
  `);
}
