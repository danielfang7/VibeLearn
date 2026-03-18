#!/usr/bin/env node
/**
 * Standalone dev tool for the Intervention Engine.
 * Reads real prompts from the seeded test-workspace session log and calls Claude directly.
 * No VS Code required — fast iteration without the F5 cycle.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npm run dev:engine
 *   ANTHROPIC_API_KEY=sk-... npm run dev:engine -- --mode=debrief
 *   ANTHROPIC_API_KEY=sk-... npm run dev:engine -- --mode=explain
 *
 * Run `npm run dev:seed` first to populate test prompts.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// ── Config ────────────────────────────────────────────────────────────────────

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY env var is not set.');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const MODE = process.argv.includes('--mode=debrief') ? 'debrief'
  : process.argv.includes('--mode=explain') ? 'explain'
  : 'quiz';

// Must match the path in .vscode/launch.json
const WORKSPACE = path.join(os.homedir(), 'vibelearn-test');
const encoded = WORKSPACE.replace(/\//g, '-');
const projectDir = path.join(os.homedir(), '.claude', 'projects', encoded);

// ── Read seeded prompts ───────────────────────────────────────────────────────

function readPrompts() {
  if (!fs.existsSync(projectDir)) return [];
  const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
  const prompts = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        if (
          entry.type === 'user' &&
          !entry.isMeta &&
          typeof entry.message?.content === 'string'
        ) {
          const c = entry.message.content;
          if (!c.startsWith('<command-name>') && !c.startsWith('<local-command-caveat>')) {
            prompts.push(c);
          }
        }
      } catch {
        // malformed line — skip
      }
    }
  }
  return prompts;
}

// ── Read git diffs ────────────────────────────────────────────────────────────

const DIFF_CHAR_LIMIT = 8000;

function readDiffs() {
  try {
    let raw;
    try {
      raw = execSync('git diff HEAD', { cwd: WORKSPACE, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      raw = '';
    }
    if (!raw.trim()) {
      raw = execSync('git diff HEAD~5 HEAD', { cwd: WORKSPACE, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).catch(() => '');
    }
    const diffs = [];
    let totalChars = 0;
    for (const block of raw.split(/^diff --git /m).filter(Boolean)) {
      if (totalChars >= DIFF_CHAR_LIMIT) break;
      const match = block.match(/^a\/.+ b\/(.+)\n/);
      if (match) {
        diffs.push({ path: match[1], diff: block });
        totalChars += block.length;
      }
    }
    return diffs;
  } catch {
    return [];
  }
}

function readFileStructure() {
  try {
    const output = execSync('git ls-files --name-only', { cwd: WORKSPACE, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ── Build prompts (mirrors interventionEngine.ts) ─────────────────────────────

function buildQuizPrompt(prompts, diffs) {
  const diffSummary = diffs.length > 0
    ? diffs.slice(0, 5).map((d) => `[${d.path}]:\n${d.diff.slice(0, 400)}`).join('\n\n')
    : '(no git diffs detected)';

  return `You are a developer education assistant. A developer just finished an AI-assisted coding session.

Session Summary:
- Languages/frameworks: TypeScript, JavaScript
- Recent prompts: ${prompts.slice(-3).map((p) => `"${p}"`).join('; ')}
- Key changes (truncated):
${diffSummary}

Developer's prior knowledge state:
No prior history.

Your job:
1. Identify the single most valuable concept to test from this session.
2. Choose the best intervention format from: concept_check, explain_it_back, micro_reading
3. Return ONLY a valid JSON object matching this schema (no markdown, no explanation):
{
  "type": "<intervention type>",
  "title": "<short title, conversational tone>",
  "body": "<the question or content, under 150 words>",
  "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
  "answer": "<correct answer>",
  "conceptTags": ["<tag1>", "<tag2>"],
  "difficultyScore": <1-5>
}

Rules:
- Keep it short. Should take under 60 seconds to answer.
- Be conversational, not academic.
- options and answer are only for concept_check; omit them for other types.
- If the concept is advanced, prefer micro_reading over a hard quiz.`;
}

function buildDebriefPrompt(prompts, diffs) {
  const diffSummary = diffs.length > 0
    ? diffs.slice(0, 5).map((d) => `[${d.path}]:\n${d.diff.slice(0, 400)}`).join('\n\n')
    : '(no code changes detected)';

  return `You are a developer education assistant helping a developer understand what they just built.

Session timestamp: ${new Date().toISOString()}
Languages/frameworks: TypeScript, JavaScript

Recent prompts (what they asked the AI):
${prompts.slice(-5).map((p) => `- "${p}"`).join('\n') || 'None.'}

Recent commits:
(using test workspace)

Key code changes:
${diffSummary}

Prior codebase story:
No prior sessions recorded — this is the first debrief.

Write a 4–6 sentence narrative explaining what was built, the key pattern used, and how it fits the codebase.

Return ONLY valid JSON:
{
  "type": "session_narrative",
  "title": "<5–7 words: what was built>",
  "body": "<narrative, 4–6 sentences, under 120 words>",
  "conceptTags": ["<tag1>", "<tag2>"],
  "difficultyScore": 0
}`;
}

function buildExplainPrompt(diffs, fileStructure) {
  const diffSummary = diffs.length > 0
    ? diffs.slice(0, 5).map((d) => `[${d.path}]:\n${d.diff.slice(0, 400)}`).join('\n\n')
    : '(no code changes detected)';

  return `You are a developer education assistant. Explain this codebase to the developer who built it.

Tracked files:
${fileStructure.slice(0, 80).join('\n') || 'No tracked files found.'}

Key code changes:
${diffSummary}

Return ONLY valid JSON:
{
  "type": "session_narrative",
  "title": "Your Codebase Explained",
  "body": "<structured briefing with **Purpose:**, **Major Components:**, **Data Flow:**, **Key Patterns:**, **Open Questions:**>",
  "conceptTags": [],
  "difficultyScore": 0
}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const prompts = readPrompts();
if (prompts.length === 0) {
  console.log('⚠ No seeded prompts found. Run `npm run dev:seed` first.');
  console.log('  Using fallback prompts for now.\n');
  prompts.push(
    'how do I use Promise.all to fetch multiple APIs concurrently?',
    'implement a generic debounce function with TypeScript types',
    'what is the difference between interface and type alias?'
  );
} else {
  console.log(`✓ Loaded ${prompts.length} prompts from seeded session\n`);
}

const diffs = readDiffs();
const fileStructure = readFileStructure();
console.log(`✓ Got ${diffs.length} file diff(s) | ${fileStructure.length} tracked files\n`);

let prompt;
if (MODE === 'debrief') {
  console.log('Mode: DEBRIEF (session_narrative)\n');
  prompt = buildDebriefPrompt(prompts, diffs);
} else if (MODE === 'explain') {
  console.log('Mode: EXPLAIN (codebase briefing)\n');
  prompt = buildExplainPrompt(diffs, fileStructure);
} else {
  console.log('Mode: QUIZ\n');
  prompt = buildQuizPrompt(prompts, diffs);
}

console.log('Calling claude-sonnet-4-6...\n');

const client = new Anthropic({ apiKey });
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
});

const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

console.log('── Raw response ─────────────────────────────────────────────────');
console.log(text);
console.log('\n── Parsed result ────────────────────────────────────────────────');
try {
  const parsed = JSON.parse(cleaned);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log('(Response is not valid JSON — check the raw output above)');
}
