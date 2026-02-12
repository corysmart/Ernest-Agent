import { GoalStack } from '../../goals/goal-stack';
import type { Goal } from '../../goals/types';

describe('GoalStack', () => {
  it('returns highest priority active or pending goal', () => {
    const stack = new GoalStack();
    const goals: Goal[] = [
      { id: 'g1', title: 'Low', priority: 1, status: 'pending', horizon: 'long', createdAt: 1, updatedAt: 1 },
      { id: 'g2', title: 'High', priority: 5, status: 'active', horizon: 'short', createdAt: 2, updatedAt: 2 }
    ];

    goals.forEach((goal) => stack.addGoal(goal));

    const next = stack.resolveNextGoal();
    expect(next?.id).toBe('g2');
  });

  it('rejects duplicate goal ids', () => {
    const stack = new GoalStack();
    const goal: Goal = { id: 'dup', title: 'Goal', priority: 1, status: 'pending', horizon: 'short', createdAt: 1, updatedAt: 1 };

    stack.addGoal(goal);
    expect(() => stack.addGoal(goal)).toThrow('Goal with id already exists');
  });

  it('rejects invalid goal payloads', () => {
    const stack = new GoalStack();

    expect(() => stack.addGoal({
      id: '',
      title: '',
      priority: -1,
      status: 'pending',
      horizon: 'short',
      createdAt: 1,
      updatedAt: 1
    } as Goal)).toThrow('Invalid goal');
  });

  it('updateStatus is no-op for non-existent goal', () => {
    const stack = new GoalStack();
    stack.addGoal({ id: 'g1', title: 'G', priority: 1, status: 'pending', horizon: 'short', createdAt: 1, updatedAt: 1 });
    expect(() => stack.updateStatus('missing', 'active')).not.toThrow();
  });

  it('updateStatus updates existing goal', () => {
    const stack = new GoalStack();
    stack.addGoal({ id: 'g1', title: 'G', priority: 1, status: 'pending', horizon: 'short', createdAt: 1, updatedAt: 1 });
    stack.updateStatus('g1', 'active');
    const next = stack.resolveNextGoal();
    expect(next?.status).toBe('active');
  });

  it('resolveNextGoal returns null when no candidates', () => {
    const stack = new GoalStack();
    expect(stack.resolveNextGoal()).toBeNull();
  });

  it('resolveNextGoal breaks ties by horizon then createdAt', () => {
    const stack = new GoalStack();
    stack.addGoal({ id: 'g1', title: 'A', priority: 1, status: 'active', horizon: 'long', createdAt: 100, updatedAt: 1 });
    stack.addGoal({ id: 'g2', title: 'B', priority: 1, status: 'active', horizon: 'short', createdAt: 50, updatedAt: 1 });
    const next = stack.resolveNextGoal();
    expect(next?.id).toBe('g2');
  });

  it('listGoals returns defensive copies with candidateActions', () => {
    const stack = new GoalStack();
    stack.addGoal({
      id: 'g1',
      title: 'G',
      priority: 1,
      status: 'pending',
      horizon: 'short',
      createdAt: 1,
      updatedAt: 1,
      candidateActions: [{ type: 'act', payload: { x: 1 } }]
    });
    const list = stack.listGoals();
    expect(list).toHaveLength(1);
    expect(list[0]!.candidateActions).toHaveLength(1);
  });
});
