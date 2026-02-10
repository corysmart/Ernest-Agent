import { buildContainer } from '../../server/container';
import { ScopedMemoryManager } from '../../memory/scoped-memory-manager';
import type { MemoryManager } from '../../memory/memory-manager';

describe('Tenant Isolation', () => {
  it('P2: ScopedMemoryManager prevents cross-tenant memory contamination', async () => {
    const containerContext = await buildContainer();
    const { container } = containerContext;
    const baseMemoryManager = container.resolve<MemoryManager>('memoryManager');

    // Create scoped managers for two different tenants
    const tenantAManager = new ScopedMemoryManager(baseMemoryManager, 'tenant-a');
    const tenantBManager = new ScopedMemoryManager(baseMemoryManager, 'tenant-b');

    // Tenant A stores a memory
    await tenantAManager.addEpisodic({
      id: 'tenant-a-memory',
      type: 'episodic',
      content: 'Tenant A confidential data',
      createdAt: Date.now(),
      eventType: 'observation'
    });

    // Tenant B queries - they should NOT see tenant A's memory
    const results = await tenantBManager.query({
      text: 'confidential',
      limit: 10
    });

    // After fix: tenant B should not see tenant A's data
    expect(results.some((r) => r.memory.id === 'tenant-a-memory')).toBe(false);
    
    await containerContext.cleanup();
  });

  it('P2: ScopedMemoryManager isolates memories between different scopes', async () => {
    const containerContext = await buildContainer();
    const { container } = containerContext;
    const baseMemoryManager = container.resolve<MemoryManager>('memoryManager');

    const request1Manager = new ScopedMemoryManager(baseMemoryManager, 'request-1');
    const request2Manager = new ScopedMemoryManager(baseMemoryManager, 'request-2');

    // Request 1 stores memory
    await request1Manager.addEpisodic({
      id: 'request-1-memory',
      type: 'episodic',
      content: 'Request 1 data',
      createdAt: Date.now(),
      eventType: 'observation'
    });

    // Request 2 should NOT see Request 1's memory
    const results = await request2Manager.query({
      text: 'Request 1',
      limit: 10
    });

    expect(results.some((r) => r.memory.id === 'request-1-memory')).toBe(false);
    
    // But Request 1 should see its own memory
    const request1Results = await request1Manager.query({
      text: 'Request 1',
      limit: 10
    });
    expect(request1Results.some((r) => r.memory.id === 'request-1-memory')).toBe(true);
    
    await containerContext.cleanup();
  });

  it('P2: ScopedMemoryManager skips persistence when persist=false', async () => {
    const containerContext = await buildContainer();
    const { container } = containerContext;
    const baseMemoryManager = container.resolve<MemoryManager>('memoryManager');

    // Create non-persisting manager (for anonymous requests)
    const nonPersistingManager = new ScopedMemoryManager(baseMemoryManager, 'anonymous-request', false);

    // Add memory - should not persist
    await nonPersistingManager.addEpisodic({
      id: 'temp-memory',
      type: 'episodic',
      content: 'Temporary data',
      createdAt: Date.now(),
      eventType: 'observation'
    });

    // Query should return empty (memory not persisted)
    const results = await nonPersistingManager.query({
      text: 'Temporary',
      limit: 10
    });

    expect(results).toHaveLength(0);
    
    await containerContext.cleanup();
  });
});

