export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export interface MemoryMetadata {
  source?: string;
  goalId?: string;
  tags?: string[];
}

export interface BaseMemory {
  id: string;
  type: MemoryType;
  content: string;
  createdAt: number;
  lastAccessedAt?: number;
  metadata?: MemoryMetadata;
}

export interface EpisodicMemory extends BaseMemory {
  type: 'episodic';
  eventType: string;
}

export interface SemanticMemory extends BaseMemory {
  type: 'semantic';
  factConfidence: number;
}

export interface ProceduralMemory extends BaseMemory {
  type: 'procedural';
  planSummary: string;
  successRate: number;
}

export type MemoryItem = EpisodicMemory | SemanticMemory | ProceduralMemory;

export interface MemoryQuery {
  text: string;
  limit?: number;
  types?: MemoryType[];
  goals?: GoalReference[];
}

export interface GoalReference {
  id: string;
  title: string;
  description?: string;
  priority?: number;
}

export interface MemorySearchResult {
  memory: MemoryItem;
  score: number;
  similarity: number;
  timeDecay: number;
  goalRelevance: number;
}
