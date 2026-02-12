/**
 * Merges observations from multiple adapters.
 * Useful for combining OpenClaw workspace content with other sources (e.g., API, queue).
 * Later adapters override earlier ones for overlapping keys.
 * Per-adapter errors are caught and logged; failing adapters are skipped so partial data is returned.
 */

import type { ObservationAdapter } from './observation-adapter';
import type { RawTextObservation } from './types';

export class CompositeObservationAdapter implements ObservationAdapter {
  constructor(private readonly adapters: ObservationAdapter[]) {}

  async getObservations(): Promise<RawTextObservation> {
    const result: RawTextObservation = {};
    for (const [i, adapter] of this.adapters.entries()) {
      try {
        const obs = await adapter.getObservations();
        Object.assign(result, obs);
      } catch (error) {
        console.error(
          `[CompositeObservationAdapter] Adapter ${i} failed:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    return result;
  }
}
