import { GoalStack } from '../../goals/goal-stack';
import type { Goal } from '../../goals/types';

describe('Goal Stack - Defensive Copy', () => {
  it('P3: returns defensive copies to prevent mutation of internal state', () => {
    const stack = new GoalStack();
    
    const goal: Goal = {
      id: 'goal-1',
      title: 'Test Goal',
      description: 'Test',
      priority: 5,
      status: 'active',
      horizon: 'short',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      candidateActions: [
        { type: 'action-1', payload: { key: 'value' } }
      ]
    };

    stack.addGoal(goal);

    const listedGoals = stack.listGoals();
    expect(listedGoals).toHaveLength(1);

    // Mutate the returned goal
    const returnedGoal = listedGoals[0]!;
    returnedGoal.priority = 999;
    returnedGoal.status = 'completed';
    returnedGoal.candidateActions![0]!.payload = { mutated: true };

    // Get goals again - should be unchanged
    const listedGoalsAgain = stack.listGoals();
    expect(listedGoalsAgain).toHaveLength(1);
    expect(listedGoalsAgain[0]!.priority).toBe(5); // Original value
    expect(listedGoalsAgain[0]!.status).toBe('active'); // Original value
    expect(listedGoalsAgain[0]!.candidateActions![0]!.payload).toEqual({ key: 'value' }); // Original value
  });

  it('P3: creates deep copies of candidateActions to prevent mutation', () => {
    const stack = new GoalStack();
    
    const goal: Goal = {
      id: 'goal-1',
      title: 'Test',
      priority: 1,
      status: 'active',
      horizon: 'short',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      candidateActions: [
        { type: 'action-1', payload: { nested: { value: 'original' } } }
      ]
    };

    stack.addGoal(goal);

    const listedGoals = stack.listGoals();
    const action = listedGoals[0]!.candidateActions![0]!;
    
    // Mutate nested payload
    (action.payload as any).nested.value = 'mutated';

    // Get goals again - should be unchanged
    const listedGoalsAgain = stack.listGoals();
    const actionAgain = listedGoalsAgain[0]!.candidateActions![0]!;
    expect((actionAgain.payload as any).nested.value).toBe('original');
  });

  it('handles goals without candidateActions', () => {
    const stack = new GoalStack();
    
    const goal: Goal = {
      id: 'goal-1',
      title: 'Test',
      priority: 1,
      status: 'active',
      horizon: 'short',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    stack.addGoal(goal);

    const listedGoals = stack.listGoals();
    expect(listedGoals).toHaveLength(1);
    expect(listedGoals[0]!.candidateActions).toBeUndefined();
  });
});

