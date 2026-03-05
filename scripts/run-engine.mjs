#!/usr/bin/env node
/**
 * Standalone end-to-end test for the Intervention Engine.
 * Reads real prompts from the seeded test-workspace session log and calls Claude directly.
 * No VS Code required — fast iteration without the F5 cycle.
 *
 *   ANTHROPIC_API_KEY=sk-... npm run dev:engine
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

function readDiffs() {
  try {
    const raw = execSync('git diff HEAD', {
      cwd: WORKSPACE,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const diffs = [];
    for (const block of raw.split(/^diff --git /m).filter(Boolean)) {
      const match = block.match(/^a\/.+ b\/(.+)\n/);
      if (match) diffs.push({ path: match[1], diff: block });
    }
    return diffs;
  } catch {
    return [];
  }
}

// ── Build prompt (mirrors interventionEngine.ts) ──────────────────────────────

function buildPrompt(prompts, diffs) {
  const diffSummary = diffs
    .slice(0, 5)
    .map((d) => `[${d.path}]:\n${d.diff.slice(0, 400)}`)
    .join('\n\n');

  return `You are a developer education assistant. A developer just finished an AI-assisted coding session.

Session Summary:
- Languages/frameworks: TypeScript, JavaScript
- Recent prompts: ${prompts.slice(-3).map((p) => `"${p}"`).join('; ')}
- Key changes (truncated):
${diffSummary || '(no git diffs detected)'}

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
console.log(`✓ Got ${diffs.length} file diff(s) from git diff HEAD\n`);

const prompt = buildPrompt(prompts, diffs);
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
console.log('\n── Parsed intervention ──────────────────────────────────────────');
try {
  const parsed = JSON.parse(cleaned);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log('(Response is not valid JSON — check the raw output above)');
}
