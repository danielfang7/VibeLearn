#!/usr/bin/env node
/**
 * Seeds a fake Claude Code session log for the test-workspace project directory.
 * Run this once before pressing F5 so the ClaudeCodeAdapter detects real-looking prompts.
 *
 * Modes:
 *   npm run dev:seed               → quiz mode (10 prompts, fires on prompt count)
 *   npm run dev:seed -- --mode=debrief → debrief mode (sets up workspace + prompts for session gap)
 *
 * For debrief mode: after seeding, set vibelearn.sessionGapMinutes=1 in VS Code settings,
 * then press F5 — the debrief will fire ~1 minute after the extension starts.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';

// Must match the path in .vscode/launch.json (the folder the extension host opens).
const WORKSPACE = process.env.VIBELEARN_TEST_WORKSPACE ?? path.join(os.homedir(), 'vibelearn-test');
// Adapter encodes the workspace path by replacing every / with -
const encoded = WORKSPACE.replace(/\//g, '-');
const projectDir = path.join(os.homedir(), '.claude', 'projects', encoded);

const MODE = process.argv.includes('--mode=debrief') ? 'debrief' : 'quiz';

if (MODE === 'debrief') {
  seedDebriefSession();
} else {
  seedQuizSession();
}

// ── Quiz mode (default) ───────────────────────────────────────────────────────

function seedQuizSession() {
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

  writePromptLog(sessionFile, prompts, /* minutesAgo */ 15);

  console.log(`✓ Seeded ${prompts.length} prompts (quiz mode)`);
  console.log(`  → ${sessionFile}`);
  console.log('\nNow press F5 — the Extension Development Host will open the test workspace.');
  console.log('A quiz will trigger after every 10 prompts (default) or via "Quiz Me Now".');
}

// ── Debrief mode ──────────────────────────────────────────────────────────────

function seedDebriefSession() {
  // 1. Ensure workspace exists with a git repo and some code changes
  setupWorkspace();

  // 2. Write debrief-themed prompts so the engine has narrative context
  fs.mkdirSync(projectDir, { recursive: true });
  const sessionId = crypto.randomUUID();
  const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

  const prompts = [
    'help me design a middleware pipeline for Express — I want auth, rate limiting, and logging',
    'implement a JWT authentication middleware that validates tokens and attaches user to req',
    'how do I structure a repository pattern for my User model with TypeScript?',
    'add rate limiting middleware using a token bucket approach',
    'help me write a database connection pool with retry logic',
    'how should I handle async errors in Express middleware chains?',
  ];

  writePromptLog(sessionFile, prompts, /* minutesAgo */ 20);

  console.log(`✓ Seeded ${prompts.length} prompts (debrief mode)`);
  console.log(`  → ${sessionFile}`);
  console.log(`✓ Created TypeScript source files with git diff in ${WORKSPACE}`);
  console.log('');
  console.log('Next steps to trigger the debrief quickly:');
  console.log('  1. Open VS Code settings: vibelearn.sessionGapMinutes = 1');
  console.log('  2. Press F5 to open the Extension Development Host');
  console.log('  3. The debrief will fire ~1 minute after extension activation');
  console.log('');
  console.log('Tip: revert to vibelearn.sessionGapMinutes = 10 after testing.');
}

function setupWorkspace() {
  fs.mkdirSync(path.join(WORKSPACE, 'src'), { recursive: true });

  const isNewRepo = !fs.existsSync(path.join(WORKSPACE, '.git'));
  if (isNewRepo) {
    execSync('git init', { cwd: WORKSPACE, stdio: 'pipe' });
    execSync('git config user.email "dev@vibelearn.test"', { cwd: WORKSPACE, stdio: 'pipe' });
    execSync('git config user.name "VibeLearn Dev"', { cwd: WORKSPACE, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', { cwd: WORKSPACE, stdio: 'pipe' });
  }

  // Write TypeScript source files — left unstaged so `git diff HEAD` returns them
  fs.writeFileSync(
    path.join(WORKSPACE, 'src', 'auth.ts'),
    `import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  role: 'admin' | 'user';
}

export function authMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing token' });
      return;
    }
    try {
      const token = header.slice(7);
      const payload = jwt.verify(token, secret) as AuthPayload;
      (req as Request & { user: AuthPayload }).user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
`
  );

  fs.writeFileSync(
    path.join(WORKSPACE, 'src', 'rateLimiter.ts'),
    `interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillRatePerSecond: number
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRatePerSecond);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }
}
`
  );

  fs.writeFileSync(
    path.join(WORKSPACE, 'src', 'userRepository.ts'),
    `export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
}

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async create(data: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = { ...data, id: crypto.randomUUID(), createdAt: new Date() };
    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    this.users.set(id, updated);
    return updated;
  }
}
`
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function writePromptLog(sessionFile, prompts, minutesAgo = 15) {
  const now = new Date();
  const sessionId = path.basename(sessionFile, '.jsonl');
  let prevUuid = null;

  const lines = prompts.map((content, i) => {
    // Space prompts evenly across the past `minutesAgo` minutes
    const ts = new Date(now.getTime() - (minutesAgo - (i * minutesAgo) / prompts.length) * 60_000);
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
}
