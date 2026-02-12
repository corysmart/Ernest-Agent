import { aggregateScore, cosineSimilarity, goalRelevanceScore, timeDecayScore } from '../../memory/scoring';

describe('memory scoring', () => {
  it('calculates cosine similarity', () => {
    const score = cosineSimilarity([1, 0], [1, 0]);
    expect(score).toBeCloseTo(1);
  });

  it('applies time decay', () => {
    const now = Date.now();
    const recent = timeDecayScore(now, now, 1000);
    const older = timeDecayScore(now - 5000, now, 1000);

    expect(recent).toBeGreaterThan(older);
    expect(recent).toBeLessThanOrEqual(1);
  });

  it('scores goal relevance by lexical overlap', () => {
    const score = goalRelevanceScore('deploy the service', [
      { id: 'g1', title: 'Deploy service', description: 'push to production' }
    ]);

    expect(score).toBeGreaterThan(0);
  });

  it('rejects invalid decay configuration', () => {
    expect(() => timeDecayScore(Date.now(), Date.now(), 0)).toThrow('Half-life must be positive');
  });

  it('cosineSimilarity returns 0 when denominator is 0', () => {
    const score = cosineSimilarity([0, 0], [0, 0]);
    expect(score).toBe(0);
  });

  it('cosineSimilarity uses provided norms', () => {
    const score = cosineSimilarity([1, 0], [1, 0], 1, 1);
    expect(score).toBeCloseTo(1);
  });

  it('goalRelevanceScore returns 0 for empty text', () => {
    expect(goalRelevanceScore('', [{ id: 'g1', title: 'Deploy', description: 'desc' }])).toBe(0);
  });

  it('goalRelevanceScore returns 0 for empty goals', () => {
    expect(goalRelevanceScore('deploy service', [])).toBe(0);
  });

  it('aggregateScore accepts custom weights', () => {
    const score = aggregateScore(0.5, 0.5, 0.5, { similarity: 1, decay: 0, relevance: 0 });
    expect(score).toBe(0.5);
  });
});
