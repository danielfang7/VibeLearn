import { describe, it, expect } from 'vitest';
import { getInterventionMode } from './extension';

describe('getInterventionMode()', () => {
  it('routes session_gap to debrief', () => {
    expect(getInterventionMode('session_gap')).toBe('debrief');
  });

  it('routes prompt_count to quiz', () => {
    expect(getInterventionMode('prompt_count')).toBe('quiz');
  });

  it('routes manual to quiz', () => {
    expect(getInterventionMode('manual')).toBe('quiz');
  });
});
