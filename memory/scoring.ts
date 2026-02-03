import type { GoalReference } from './types';

export function cosineSimilarity(vectorA: number[], vectorB: number[], normA?: number, normB?: number): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vector length mismatch');
  }

  const denominator = (normA ?? vectorNorm(vectorA)) * (normB ?? vectorNorm(vectorB));
  if (denominator === 0) {
    return 0;
  }

  let dot = 0;
  for (let i = 0; i < vectorA.length; i += 1) {
    dot += vectorA[i] * vectorB[i];
  }

  return dot / denominator;
}

export function timeDecayScore(timestamp: number, now: number = Date.now(), halfLifeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  if (halfLifeMs <= 0) {
    throw new Error('Half-life must be positive');
  }

  const age = Math.max(0, now - timestamp);
  const decay = Math.exp(-age / halfLifeMs);
  return Math.min(1, Math.max(0, decay));
}

export function goalRelevanceScore(text: string, goals: GoalReference[] = []): number {
  if (!text || goals.length === 0) {
    return 0;
  }

  const tokens = new Set(tokenize(text));
  let best = 0;

  for (const goal of goals) {
    const goalTokens = new Set(tokenize(`${goal.title} ${goal.description ?? ''}`));
    let overlap = 0;
    for (const token of goalTokens) {
      if (tokens.has(token)) {
        overlap += 1;
      }
    }
    const score = overlap / Math.max(1, goalTokens.size);
    best = Math.max(best, score);
  }

  return best;
}

export function aggregateScore(similarity: number, decay: number, relevance: number, weights = { similarity: 0.6, decay: 0.2, relevance: 0.2 }): number {
  return similarity * weights.similarity + decay * weights.decay + relevance * weights.relevance;
}

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 1);
}
