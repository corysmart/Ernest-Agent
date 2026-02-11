import { ObservationNormalizer } from '../../runtime/observation-normalizer';

describe('ObservationNormalizer', () => {
  let normalizer: ObservationNormalizer;

  beforeEach(() => {
    normalizer = new ObservationNormalizer({
      maxInputLength: 1000,
      maxEventLength: 200,
      maxEvents: 10
    });
  });

  it('produces StateObservation with timestamp, state, and events', () => {
    const raw = {
      user_message: 'hello',
      context: 'some context'
    };

    const result = normalizer.normalize(raw);

    expect(result).toBeDefined();
    expect(typeof result.timestamp).toBe('number');
    expect(result.state).toBeDefined();
    expect(typeof result.state).toBe('object');
    expect(result.state.user_message).toBe('hello');
    expect(result.state.context).toBe('some context');
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('rejects oversized input - single field exceeds maxInputLength', () => {
    const raw = {
      user_message: 'x'.repeat(1001)
    };

    expect(() => normalizer.normalize(raw)).toThrow(/exceeds maximum length/i);
  });

  it('rejects oversized input - total state length exceeds cap', () => {
    normalizer = new ObservationNormalizer({
      maxInputLength: 100,
      maxEventLength: 50,
      maxEvents: 10,
      maxTotalStateLength: 100
    });
    const raw = {
      a: 'x'.repeat(60),
      b: 'y'.repeat(60)
    };

    expect(() => normalizer.normalize(raw)).toThrow(/Total state length/i);
  });

  it('rejects unsafe objects with __proto__ key', () => {
    const raw = { user_message: 'hello', __proto__: { polluted: true } } as Record<string, unknown>;

    expect(() => normalizer.normalize(raw as any)).toThrow(/Unsafe object/i);
  });

  it('rejects unsafe objects with prototype key', () => {
    const raw = { user_message: 'hello', prototype: { polluted: true } } as Record<string, unknown>;

    expect(() => normalizer.normalize(raw as any)).toThrow(/Unsafe object/i);
  });

  it('rejects unsafe objects with constructor key', () => {
    const raw = { user_message: 'hello', constructor: { polluted: true } } as Record<string, unknown>;

    expect(() => normalizer.normalize(raw as any)).toThrow(/Unsafe object/i);
  });

  it('accepts events array as JSON string and truncates to maxEvents', () => {
    normalizer = new ObservationNormalizer({
      maxInputLength: 1000,
      maxEventLength: 200,
      maxEvents: 3
    });
    const raw = {
      user_message: 'hi',
      events: '["e1","e2","e3","e4","e5"]'
    };

    const result = normalizer.normalize(raw);

    expect(result.events).toEqual(['e1', 'e2', 'e3']);
  });

  it('rejects oversized event strings', () => {
    normalizer = new ObservationNormalizer({
      maxInputLength: 1000,
      maxEventLength: 5,
      maxEvents: 10
    });
    const raw = {
      user_message: 'hi',
      events: '["short","toolong"]'
    };

    expect(() => normalizer.normalize(raw)).toThrow(/event.*exceeds/i);
  });

  it('uses provided getTime for deterministic timestamp', () => {
    const getTime = jest.fn().mockReturnValue(12345);
    normalizer = new ObservationNormalizer({
      maxInputLength: 1000,
      maxEventLength: 200,
      maxEvents: 10,
      getTime
    });

    const result = normalizer.normalize({ msg: 'hi' });

    expect(result.timestamp).toBe(12345);
    expect(getTime).toHaveBeenCalled();
  });

  it('accepts empty raw observation', () => {
    const result = normalizer.normalize({});

    expect(result.timestamp).toBeDefined();
    expect(Object.keys(result.state)).toHaveLength(0);
    expect(result.events).toEqual([]);
  });

  it('returns empty events when events key has invalid JSON', () => {
    const raw = { user_message: 'hi', events: 'not valid json' };

    const result = normalizer.normalize(raw);

    expect(result.events).toEqual([]);
  });

  it('returns empty events when events value is not array', () => {
    const raw = { user_message: 'hi', events: '{"object":"value"}' };

    const result = normalizer.normalize(raw);

    expect(result.events).toEqual([]);
  });
});
