import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import type { FileDiff, SessionAdapter, SessionContext, TriggerReason } from '../types';

// Claude Code writes conversation logs under ~/.claude/projects/<encoded-path>/
// Each project directory contains JSONL files for each session.
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

export class ClaudeCodeAdapter implements SessionAdapter {
  readonly name = 'claude-code';

  private promptCount = 0;
  private promptCallbacks: Array<(prompt: string) => void> = [];
  private fileChangedCallbacks: Array<(diff: FileDiff) => void> = [];
  private watchers: fs.FSWatcher[] = [];
  // Track per-file line offsets so we don't re-parse the same lines
  private lastSeenLines = new Map<string, number>();

  constructor(private readonly workspacePath: string) {
    this.startWatching();
  }

  getPromptCount(): number {
    return this.promptCount;
  }

  onPromptSubmitted(cb: (prompt: string) => void): void {
    this.promptCallbacks.push(cb);
  }

  onFileChanged(cb: (diff: FileDiff) => void): void {
    this.fileChangedCallbacks.push(cb);
  }

  async getSessionContext(triggerReason: TriggerReason): Promise<SessionContext> {
    const recentPrompts = this.readRecentPrompts();
    const diffs = this.getGitDiffs();
    const languages = detectLanguages(diffs);

    return {
      prompts: recentPrompts,
      diffs,
      languages,
      concepts: [], // filled in by the Intervention Engine pre-pass
      timestamp: Date.now(),
      triggerReason,
    };
  }

  dispose(): void {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
  }

  // Watch the Claude Code session log for this workspace and emit prompt events.
  private startWatching(): void {
    const projectDir = this.resolveProjectDir();
    if (!projectDir || !fs.existsSync(projectDir)) {
      return;
    }

    // Watch for new/updated JSONL session files
    const watcher = fs.watch(projectDir, { persistent: false }, (event, filename) => {
      if (filename && filename.endsWith('.jsonl')) {
        this.processSessionFile(path.join(projectDir, filename));
      }
    });
    this.watchers.push(watcher);
  }

  // Claude Code encodes the workspace path as the project directory name.
  // Example: /Users/foo/myproject → -Users-foo-myproject
  private resolveProjectDir(): string | null {
    const encoded = this.workspacePath.replace(/\//g, '-');
    const candidate = path.join(CLAUDE_PROJECTS_DIR, encoded);
    return fs.existsSync(candidate) ? candidate : null;
  }

  // Parse new lines from the JSONL log and emit prompt events.
  // Actual Claude Code log format: { type: "user" | "assistant", isMeta?: bool, message: { role, content: string } }
  private processSessionFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const lastSeen = this.lastSeenLines.get(filePath) ?? 0;

      for (let i = lastSeen; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          if (isUserPrompt(entry)) {
            const prompt = entry.message.content as string;
            this.promptCount++;
            for (const cb of this.promptCallbacks) cb(prompt);
          }
        } catch {
          // malformed line — skip
        }
      }
      this.lastSeenLines.set(filePath, lines.length);
    } catch {
      // file not readable yet — skip
    }
  }

  private readRecentPrompts(limit = 10): string[] {
    const projectDir = this.resolveProjectDir();
    if (!projectDir) return [];

    const files = fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({
        file: f,
        mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    const prompts: string[] = [];
    for (const { file } of files) {
      const content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          if (isUserPrompt(entry)) {
            prompts.push(entry.message.content as string);
          }
        } catch {
          // skip
        }
      }
      if (prompts.length >= limit) break;
    }
    return prompts.slice(-limit);
  }

  private getGitDiffs(): FileDiff[] {
    try {
      const raw = execSync('git diff HEAD', {
        cwd: this.workspacePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return parseDiffs(raw);
    } catch {
      return [];
    }
  }
}

// Guard for real user prompts — filters meta entries and slash-command messages.
// Actual format: { type: "user", isMeta?: bool, message: { role: "user", content: string } }
function isUserPrompt(entry: Record<string, unknown>): boolean {
  if (entry.type !== 'user') return false;
  if (entry.isMeta) return false;
  const content = (entry.message as Record<string, unknown> | undefined)?.content;
  if (typeof content !== 'string') return false;
  // Filter slash-command echoes and local-command caveats
  if (content.startsWith('<command-name>')) return false;
  if (content.startsWith('<local-command-caveat>')) return false;
  return content.trim().length > 0;
}

function parseDiffs(raw: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const fileBlocks = raw.split(/^diff --git /m).filter(Boolean);
  for (const block of fileBlocks) {
    const match = block.match(/^a\/.+ b\/(.+)\n/);
    if (match) {
      diffs.push({ path: match[1], diff: block });
    }
  }
  return diffs;
}

function detectLanguages(diffs: FileDiff[]): string[] {
  const extMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    rs: 'Rust',
    go: 'Go',
    rb: 'Ruby',
    java: 'Java',
    cs: 'C#',
    cpp: 'C++',
    c: 'C',
  };
  const found = new Set<string>();
  for (const { path: p } of diffs) {
    const ext = p.split('.').pop() ?? '';
    if (extMap[ext]) found.add(extMap[ext]);
  }
  return [...found];
}
