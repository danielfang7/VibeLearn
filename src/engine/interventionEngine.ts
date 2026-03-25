import Anthropic from '@anthropic-ai/sdk';
import type { CodebaseStoryEntry, Intervention, InterventionType, KnowledgeState, SessionContext } from '../types';

// One module, one API call per trigger.
// Three generation modes:
//   generateQuiz    — triggered by prompt_count, tests a concept from the session
//   generateDebrief — triggered by session_gap, explains what was built architecturally
//   generateExplain — triggered manually, gives a full codebase architectural briefing

export const ALL_QUIZ_TYPES: InterventionType[] = [
  'concept_check',
  'explain_it_back',
  'micro_reading',
  'spot_the_bug',
  'refactor_challenge',
  'analogy_prompt',
];

/**
 * How specific / granular assessments should be.
 *
 * - `architecture` (default) — Focus on WHY code was built, how decisions tie
 *   into the overall system design, and what problem they solve at a product level.
 * - `balanced` — Mix of architectural context and some implementation specifics.
 * - `implementation` — Code-level questions: specific functions, bugs, exact
 *   patterns. Best for developers who want low-level reinforcement.
 */
export type AssessmentDepth = 'architecture' | 'balanced' | 'implementation';

export interface QuizConfig {
  enabledTypes?: InterventionType[];
  minDifficulty?: number;
  maxDifficulty?: number;
  assessmentDepth?: AssessmentDepth;
}

const DIFF_CHAR_LIMIT = 8000; // ~2000 tokens @ 4 chars/token

export class InterventionEngine {
  private client: Anthropic;
  lastTokens = 0;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateQuiz(
    context: SessionContext,
    knowledgeState: KnowledgeState,
    config?: QuizConfig
  ): Promise<Intervention> {
    const prompt = buildQuizPrompt(context, knowledgeState, config);
    const text = await this.callClaude(prompt);
    return parseIntervention(text, 'micro_reading');
  }

  async generateDebrief(
    context: SessionContext,
    priorStory: CodebaseStoryEntry[]
  ): Promise<Intervention> {
    const prompt = buildDebriefPrompt(context, priorStory);
    const text = await this.callClaude(prompt);
    return parseIntervention(text, 'session_narrative');
  }

  async generateExplain(
    context: SessionContext,
    fileStructure: string[]
  ): Promise<Intervention> {
    const prompt = buildExplainPrompt(context, fileStructure);
    const text = await this.callClaude(prompt);
    return parseIntervention(text, 'session_narrative');
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    this.lastTokens = response.usage.input_tokens + response.usage.output_tokens;
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildQuizPrompt(context: SessionContext, knowledgeState: KnowledgeState, config?: QuizConfig): string {
  const knowledgeSummary = Object.entries(knowledgeState.concepts)
    .map(([concept, record]) =>
      `- ${concept}: seen ${record.seenCount}x, avg score ${record.avgScore.toFixed(2)}, next review ${record.nextReview}`
    )
    .join('\n') || 'No prior history.';

  const diffSummary = buildDiffSummary(context.diffs);
  const commitSummary = context.recentCommits.slice(0, 5).join('\n') || 'No recent commits.';

  const enabledTypes = (config?.enabledTypes && config.enabledTypes.length > 0)
    ? config.enabledTypes
    : ALL_QUIZ_TYPES;
  const minDiff = config?.minDifficulty ?? 1;
  const maxDiff = Math.max(minDiff, config?.maxDifficulty ?? 5);

  const depth = config?.assessmentDepth ?? 'architecture';

  // Per-type instructions vary by depth level.
  // architecture (default): focus on WHY the code exists, product/system fit, design rationale.
  // balanced: mix of architectural context and some implementation detail.
  // implementation: current code-level behaviour (specific bugs, exact functions).
  const TYPE_INSTRUCTIONS: Record<AssessmentDepth, Record<string, string>> = {
    architecture: {
      concept_check: 'MCQ with exactly 4 options. Ask WHY this architectural decision was made — what problem does it solve, what trade-offs did it make, or how does it connect to the rest of the system? Options must require real system-level understanding, not just pattern recognition.',
      explain_it_back: 'Free text (no options). Ask them to explain WHY this component or design decision exists — what gap it fills in the system and how it serves the product goals. No answer field needed.',
      micro_reading: 'Free text (no options). Provide a 2-3 sentence explanation of the architectural decision or pattern and why it was the right choice for this system, then ask one follow-up question about how it fits the broader codebase. No answer field needed.',
      spot_the_bug: 'Describe a conceptual or architectural issue with the approach taken (not a specific code bug). MCQ with 4 options — each option should be a plausible architectural concern. The answer field is the most significant concern.',
      refactor_challenge: 'Challenge them to rethink the architectural approach: what would change if the requirements shifted, or how might this be redesigned to better serve the product goal? Free text (no options, no answer).',
      analogy_prompt: 'Ask them to complete a product/system-level analogy: "The way [component] relates to [other component] is like ___ because ___". Body should frame the relationship in system terms. Free text. Set answer to a strong sample completion.',
    },
    balanced: {
      concept_check: 'MCQ with exactly 4 options. Ask about the concept used — its purpose in this context AND a key implementation detail. Options must be plausible enough to require real understanding.',
      explain_it_back: 'Free text (no options). Ask them to explain a key function or module: what it does AND why it was designed that way. No answer field needed.',
      micro_reading: 'Free text (no options). Provide a 2-3 sentence explanation covering both what the pattern/concept does and why it was chosen here. Follow with one question that connects implementation to intent. No answer field needed.',
      spot_the_bug: 'Take a real code snippet from the diffs, introduce ONE subtle bug (off-by-one, wrong operator, missing await, swapped args, etc.), and put the BUGGY code in a markdown code fence in the body. MCQ with 4 options. After identifying the bug, ask why it matters architecturally. The answer field is the correct option text.',
      refactor_challenge: 'Take a real code snippet and challenge them to improve it — either fixing an implementation issue or better aligning it with the architectural intent. Put the original code in a markdown code fence in the body. Free text (no options, no answer).',
      analogy_prompt: 'Ask them to complete an analogy for a design pattern or concept that bridges implementation and system design. Body: "The [concept] is like ___ because ___". Free text. Set answer to a strong sample completion.',
    },
    implementation: {
      concept_check: 'MCQ with exactly 4 options. Options must be plausible enough to require real understanding.',
      explain_it_back: 'Free text (no options). Ask them to explain a specific function or pattern in 1-2 sentences. No answer field needed.',
      micro_reading: 'Free text (no options). Provide a 2-3 sentence explanation, then ask one follow-up question. No answer field needed.',
      spot_the_bug: 'Take a real code snippet from the diffs, introduce ONE subtle bug (off-by-one, wrong operator, missing await, swapped args, etc.), and put the BUGGY code in a markdown code fence in the body. MCQ with 4 options describing possible problems. The answer field is the correct option text.',
      refactor_challenge: 'Take a real code snippet and challenge them to rewrite it (e.g., using a different pattern, without a library, more functionally). Put the original code in a markdown code fence in the body. Free text response (no options, no answer).',
      analogy_prompt: 'Ask them to complete an analogy for a design pattern or concept. Body: "The [concept] is like ___ because ___". Free text. Set answer to a strong sample completion so it can be shown as feedback.',
    },
  };

  const depthInstructions = TYPE_INSTRUCTIONS[depth];
  const typeInstructions = `Format-specific requirements:\n${enabledTypes.map((t) => `- ${t}: ${depthInstructions[t] ?? t}`).join('\n')}`;

  const focusInstruction = depth === 'architecture'
    ? 'Identify the key architectural decision or design choice made in this session — focus on WHY it was built this way, not just what it does.'
    : depth === 'balanced'
      ? 'Identify the single most valuable concept to explore — consider both its purpose in the system and how it was implemented.'
      : 'Identify the single most valuable concept to test from this session.';

  const generalRules = depth === 'architecture'
    ? `General rules:
- Keep it short. Should take under 60 seconds to answer.
- Be conversational: "You just added X — why do you think this approach was chosen over Y?"
- Prioritize system-level understanding: product goals, design trade-offs, component relationships.
- Avoid asking about specific line numbers, syntax, or implementation minutiae.
- If the concept is advanced, prefer micro_reading over a hard quiz.
- Never repeat a concept with seenCount > 3 unless its nextReview date has passed.
- Pick a DIFFERENT concept and format than any recently seen intervention.
- difficultyScore must be between ${minDiff} and ${maxDiff}.`
    : `General rules:
- Keep it short. Should take under 60 seconds to answer.
- Be conversational, not academic. "Hey, you just used X — do you know how it differs from Y?"
- If the concept is advanced, prefer micro_reading over a hard quiz.
- Never repeat a concept with seenCount > 3 unless its nextReview date has passed.
- Pick a DIFFERENT concept and format than any recently seen intervention.
- difficultyScore must be between ${minDiff} and ${maxDiff}.`;

  return `You are a developer education assistant. A developer just finished an AI-assisted coding session.

Session timestamp: ${new Date(context.timestamp).toISOString()}

Session Summary:
- Concepts touched: ${context.concepts.join(', ') || 'unknown'}
- Languages/frameworks: ${context.languages.join(', ') || 'unknown'}
- Recent prompts: ${context.prompts.slice(-3).map((p) => `"${p}"`).join('; ')}
- Recent commits:
${commitSummary}
- Key changes (truncated):
${diffSummary}

Developer's prior knowledge state:
${knowledgeSummary}

Your job:
1. ${focusInstruction}
2. Choose the best intervention format from: ${enabledTypes.join(', ')}
3. Return ONLY a valid JSON object matching this schema (no markdown, no explanation):
{
  "type": "<intervention type>",
  "title": "<short title, conversational tone>",
  "body": "<the question or content — may include a markdown code fence for spot_the_bug/refactor_challenge>",
  "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
  "answer": "<correct answer or sample answer for analogy_prompt>",
  "conceptTags": ["<tag1>", "<tag2>"],
  "difficultyScore": <${minDiff}-${maxDiff}>
}

${typeInstructions}

${generalRules}`;
}

function buildDebriefPrompt(context: SessionContext, priorStory: CodebaseStoryEntry[]): string {
  const diffSummary = buildDiffSummary(context.diffs);
  const commitSummary = context.recentCommits.slice(0, 5).join('\n') || 'No recent commits.';
  const priorStorySummary = priorStory.length > 0
    ? priorStory.map((e) => `[${e.timestamp.slice(0, 10)}] ${e.title}: ${e.summary}`).join('\n\n')
    : 'No prior sessions recorded — this is the first debrief.';
  const promptSummary = context.prompts.slice(-5).map((p) => `- "${p}"`).join('\n') || 'None.';

  return `You are a developer education assistant helping a developer understand what they just built.

Session timestamp: ${new Date(context.timestamp).toISOString()}
Languages/frameworks: ${context.languages.join(', ') || 'unknown'}

Recent prompts (what they asked the AI):
${promptSummary}

Recent commits:
${commitSummary}

Key code changes:
${diffSummary}

Prior codebase story (for continuity — do not repeat these sessions):
${priorStorySummary}

Write a 4–6 sentence narrative explaining:
1. What was built or changed in this session (use "you" language, plain English)
2. The key architectural decision or pattern used
3. How it fits into the existing codebase

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "type": "session_narrative",
  "title": "<5–7 words: what was built>",
  "body": "<narrative, 4–6 sentences, under 120 words>",
  "conceptTags": ["<tag1>", "<tag2>"],
  "difficultyScore": 0
}

Rules:
- Be direct: start with "You just built..." or "You added..."
- Focus on what it DOES and why it matters architecturally, not implementation details
- Do not repeat concepts already covered in prior sessions unless they changed significantly`;
}

function buildExplainPrompt(context: SessionContext, fileStructure: string[]): string {
  const diffSummary = buildDiffSummary(context.diffs);
  const commitSummary = context.recentCommits.slice(0, 10).join('\n') || 'No commits yet.';
  const fileList = fileStructure.slice(0, 80).join('\n') || 'No tracked files found.';

  return `You are a developer education assistant. Explain this codebase to the developer who built it.

Tracked files:
${fileList}

Recent commits:
${commitSummary}

Key code changes:
${diffSummary}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "type": "session_narrative",
  "title": "Your Codebase Explained",
  "body": "<structured briefing — see format below>",
  "conceptTags": [],
  "difficultyScore": 0
}

The body must use exactly this format (use \\n for newlines):
**Purpose:** one sentence about what this codebase does\\n\\n**Major Components:**\\n- Component: what it does\\n- Component: what it does\\n\\n**Data Flow:** how data moves through the system (1–2 sentences)\\n\\n**Key Patterns:** design patterns or architectural decisions (1–2 sentences)\\n\\n**Open Questions:** 1–2 things that might need attention`;
}

// ── Shared utilities ─────────────────────────────────────────────────────────

function buildDiffSummary(diffs: Array<{ path: string; diff: string }>): string {
  if (diffs.length === 0) return '(no code changes detected)';
  return diffs
    .slice(0, 5)
    .map((d) => `[${d.path}]:\n${d.diff.slice(0, 400)}`)
    .join('\n\n');
}

function parseIntervention(text: string, defaultType: InterventionType): Intervention {
  // Empty response guard (critical gap fix)
  if (!text.trim()) {
    return {
      type: defaultType,
      title: 'Something to think about',
      body: defaultType === 'session_narrative'
        ? 'Take a moment to reflect on what you just built. What was the most interesting architectural decision you made?'
        : 'Review the code you just wrote. What does it do, and why did you write it that way?',
      conceptTags: [],
      difficultyScore: defaultType === 'session_narrative' ? 0 : 2,
    };
  }

  // Strip any accidental markdown fences
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<Intervention>;
    return {
      type: parsed.type ?? defaultType,
      title: parsed.title ?? 'Quick check',
      body: parsed.body ?? '',
      options: parsed.options,
      answer: parsed.answer,
      conceptTags: parsed.conceptTags ?? [],
      difficultyScore: parsed.difficultyScore ?? (defaultType === 'session_narrative' ? 0 : 3),
    };
  } catch {
    // Fallback: surface the raw text as a micro_reading / narrative
    return {
      type: defaultType,
      title: 'Something to think about',
      body: text.slice(0, 300),
      conceptTags: [],
      difficultyScore: defaultType === 'session_narrative' ? 0 : 2,
    };
  }
}

// Export for testing
export { buildDiffSummary, parseIntervention, DIFF_CHAR_LIMIT };
