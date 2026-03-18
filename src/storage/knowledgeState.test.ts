import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KnowledgeStateStore } from './knowledgeState';

let tmpDir: string;
let store: KnowledgeStateStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-ks-'));
  store = new KnowledgeStateStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('KnowledgeStateStore', () => {
  describe('initial state', () => {
    it('returns empty concepts and ratings when file does not exist', () => {
      const state = store.getState();
      expect(state.concepts).toEqual({});
      expect(state.debriefRatings).toEqual([]);
    });

    it('returns empty state when file is corrupt JSON', () => {
      fs.writeFileSync(path.join(tmpDir, 'knowledge.json'), 'not-json', 'utf-8');
      const fresh = new KnowledgeStateStore(tmpDir);
      expect(fresh.getState().concepts).toEqual({});
    });
  });

  describe('recordResult()', () => {
    it('creates a new concept record on first result', () => {
      store.recordResult('async/await', 1);
      const record = store.getState().concepts['async/await'];
      expect(record.seenCount).toBe(1);
      expect(record.avgScore).toBe(1);
      expect(record.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('updates avgScore as a running average', () => {
      store.recordResult('promises', 1);
      store.recordResult('promises', 0);
      const record = store.getState().concepts['promises'];
      expect(record.seenCount).toBe(2);
      expect(record.avgScore).toBeCloseTo(0.5);
    });

    it('persists to disk', () => {
      store.recordResult('closures', 0.5);
      const fresh = new KnowledgeStateStore(tmpDir);
      expect(fresh.getState().concepts['closures']).toBeDefined();
    });

    it('calculates a next review date 1 day out on failure (score < 0.5)', () => {
      store.recordResult('closures', 0);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(store.getState().concepts['closures'].nextReview).toBe(
        tomorrow.toISOString().split('T')[0]
      );
    });
  });

  describe('recordRating()', () => {
    it('appends a debrief rating', () => {
      store.recordRating(4, ['React hooks', 'useEffect']);
      const ratings = store.getState().debriefRatings ?? [];
      expect(ratings).toHaveLength(1);
      expect(ratings[0].stars).toBe(4);
      expect(ratings[0].conceptTags).toEqual(['React hooks', 'useEffect']);
    });

    it('accumulates multiple ratings', () => {
      store.recordRating(5, ['async/await']);
      store.recordRating(3, ['closures']);
      expect(store.getState().debriefRatings).toHaveLength(2);
    });

    it('persists ratings to disk', () => {
      store.recordRating(4, ['TypeScript']);
      const fresh = new KnowledgeStateStore(tmpDir);
      expect(fresh.getState().debriefRatings).toHaveLength(1);
    });
  });

  describe('backwards compatibility', () => {
    it('loads legacy knowledge.json without debriefRatings field', () => {
      const legacy = { concepts: { 'async/await': { seenCount: 1, lastSeen: '2026-01-01', avgScore: 1, nextReview: '2026-01-02' } } };
      fs.writeFileSync(path.join(tmpDir, 'knowledge.json'), JSON.stringify(legacy), 'utf-8');
      const fresh = new KnowledgeStateStore(tmpDir);
      expect(fresh.getState().debriefRatings).toEqual([]);
      expect(fresh.getState().concepts['async/await'].seenCount).toBe(1);
    });
  });
});
