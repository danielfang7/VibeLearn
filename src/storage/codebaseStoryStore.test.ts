import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodebaseStoryStore } from './codebaseStoryStore';
import type { CodebaseStoryEntry } from '../types';

let tmpDir: string;
let store: CodebaseStoryStore;

const sampleEntry: CodebaseStoryEntry = {
  timestamp: '2026-03-18T03:00:00.000Z',
  title: 'Built the debrief feature',
  summary: 'You just added a session debrief system that explains what you built.',
  conceptTags: ['VS Code API', 'TypeScript'],
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-story-'));
  store = new CodebaseStoryStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CodebaseStoryStore', () => {
  describe('append()', () => {
    it('returns true on first write', () => {
      const isFirst = store.append(sampleEntry);
      expect(isFirst).toBe(true);
    });

    it('returns false on subsequent writes', () => {
      store.append(sampleEntry);
      const isFirst = store.append({ ...sampleEntry, title: 'Second entry' });
      expect(isFirst).toBe(false);
    });

    it('creates .vibelearn directory if it does not exist', () => {
      store.append(sampleEntry);
      expect(fs.existsSync(path.join(tmpDir, '.vibelearn'))).toBe(true);
    });

    it('creates both JSON and Markdown files', () => {
      store.append(sampleEntry);
      expect(fs.existsSync(path.join(tmpDir, '.vibelearn', 'codebase-story.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.vibelearn', 'codebase-story.md'))).toBe(true);
    });

    it('persists the entry in the JSON store', () => {
      store.append(sampleEntry);
      const fresh = new CodebaseStoryStore(tmpDir);
      const entries = fresh.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe(sampleEntry.title);
      expect(entries[0].summary).toBe(sampleEntry.summary);
      expect(entries[0].conceptTags).toEqual(sampleEntry.conceptTags);
    });

    it('accumulates multiple entries', () => {
      store.append(sampleEntry);
      store.append({ ...sampleEntry, title: 'Second session', timestamp: '2026-03-19T03:00:00.000Z' });
      expect(store.getAllEntries()).toHaveLength(2);
    });

    it('includes the entry title and date in the Markdown output', () => {
      store.append(sampleEntry);
      const md = store.getMarkdown();
      expect(md).toContain('2026-03-18');
      expect(md).toContain('Built the debrief feature');
      expect(md).toContain(sampleEntry.summary);
    });
  });

  describe('getRecentEntries()', () => {
    it('returns empty array when no entries exist', () => {
      expect(store.getRecentEntries()).toEqual([]);
    });

    it('returns entries newest-first', () => {
      store.append({ ...sampleEntry, timestamp: '2026-03-17T00:00:00.000Z', title: 'First' });
      store.append({ ...sampleEntry, timestamp: '2026-03-18T00:00:00.000Z', title: 'Second' });
      const recent = store.getRecentEntries(2);
      expect(recent[0].title).toBe('Second');
      expect(recent[1].title).toBe('First');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        store.append({ ...sampleEntry, title: `Session ${i}`, timestamp: `2026-03-${String(i + 10).padStart(2, '0')}T00:00:00.000Z` });
      }
      expect(store.getRecentEntries(3)).toHaveLength(3);
    });
  });

  describe('getAllEntries()', () => {
    it('returns all entries oldest-first', () => {
      store.append({ ...sampleEntry, timestamp: '2026-03-17T00:00:00.000Z', title: 'First' });
      store.append({ ...sampleEntry, timestamp: '2026-03-18T00:00:00.000Z', title: 'Second' });
      const all = store.getAllEntries();
      expect(all[0].title).toBe('First');
      expect(all[1].title).toBe('Second');
    });
  });

  describe('getMarkdown()', () => {
    it('returns empty string when no story file exists', () => {
      expect(store.getMarkdown()).toBe('');
    });
  });

  describe('error handling', () => {
    it('returns empty array when JSON file is corrupt', () => {
      fs.mkdirSync(path.join(tmpDir, '.vibelearn'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.vibelearn', 'codebase-story.json'), 'not-json', 'utf-8');
      const fresh = new CodebaseStoryStore(tmpDir);
      expect(fresh.getAllEntries()).toEqual([]);
    });
  });
});
