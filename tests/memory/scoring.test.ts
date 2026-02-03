import { cosineSimilarity, goalRelevanceScore, timeDecayScore } from '../../memory/scoring';

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
});
