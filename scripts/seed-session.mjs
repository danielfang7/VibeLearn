#!/usr/bin/env node
/**
 * Seeds a fake Claude Code session log for the test-workspace project directory.
 * Run this once before pressing F5 so the ClaudeCodeAdapter detects real-looking prompts.
 *
 *   npm run dev:seed
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Must match the path in .vscode/launch.json (the folder the extension host opens).
const WORKSPACE = path.join(os.homedir(), 'vibelearn-test');
// Adapter encodes the workspace path by replacing every / with -
const encoded = WORKSPACE.replace(/\//g, '-');
const projectDir = path.join(os.homedir(), '.claude', 'projects', encoded);

fs.mkdirSync(projectDir, { recursive: true });

const sessionId = crypto.randomUUID();
const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

// Realistic prompts a dev would make while building a TypeScript project.
const prompts = [
  'how do I use Promise.all to fetch multiple APIs concurrently in TypeScript?',
  'can you help me implement a generic debounce function with proper TypeScript types?',
  "what's the difference between interface and type alias in TypeScript, when do I use which?",
  'add try/catch error handling to the fetch client — I want typed error responses',
  'how does the Partial<T> utility type work internally and when should I use it vs Required<T>?',
  'implement a simple typed event emitter class using generics',
  'what does the infer keyword do in conditional types? show me a practical example',
  'how do I type a function that returns different shapes based on a discriminant input?',
  "explain how TypeScript's ReturnType<T> utility type is implemented under the hood",
  'create a useDebounce React hook that properly cleans up the timer on unmount',
];

const now = new Date();
let prevUuid = null;
const lines = prompts.map((content, i) => {
  const ts = new Date(now.getTime() - (prompts.length - i) * 90_000); // ~90s apart
  const uuid = crypto.randomUUID();
  const entry = {
    parentUuid: prevUuid,
    isSidechain: false,
    userType: 'external',
    cwd: WORKSPACE,
    sessionId,
    version: '2.1.63',
    type: 'user',
    message: { role: 'user', content },
    isMeta: false,
    uuid,
    timestamp: ts.toISOString(),
  };
  prevUuid = uuid;
  return JSON.stringify(entry);
});

fs.writeFileSync(sessionFile, lines.join('\n') + '\n', 'utf-8');
console.log(`✓ Seeded ${prompts.length} prompts`);
console.log(`  → ${sessionFile}`);
console.log('\nNow press F5 — the Extension Development Host will open ~/vibelearn-test automatically.');
