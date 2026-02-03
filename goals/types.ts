export type GoalStatus = 'pending' | 'active' | 'completed' | 'failed' | 'blocked';
export type GoalHorizon = 'short' | 'long';

export interface Goal {
  id: string;
  title: string;
  description?: string;
  priority: number;
  status: GoalStatus;
  horizon: GoalHorizon;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  candidateActions?: Array<{ type: string; payload?: Record<string, unknown> }>;
}

export interface PlanStep {
  id: string;
  description: string;
  action: { type: string; payload?: Record<string, unknown> };
  expectedScore?: number;
}

export interface Plan {
  id: string;
  goalId: string;
  createdAt: number;
  steps: PlanStep[];
}
