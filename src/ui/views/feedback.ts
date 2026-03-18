import { html, escHtml } from './shared';

export function getFeedbackHtml(wasCorrect: boolean, explanation: string): string {
  return html(`
    <div class="feedback ${wasCorrect ? 'correct' : 'incorrect'}">
      <h2>${wasCorrect ? 'Nice work.' : 'Not quite.'}</h2>
      <p>${escHtml(explanation)}</p>
      <button onclick="postMsg('skip')">Continue coding</button>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function postMsg(type) { vscode.postMessage({ type }); }
    </script>
  `);
}
