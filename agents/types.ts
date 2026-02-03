export type AgentRole = string;

export interface AgentProfile {
  id: string;
  role: AgentRole;
  capabilities: string[];
  allowedMemoryScopes: string[];
  createdAt?: number;
}
