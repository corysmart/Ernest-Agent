/**
 * StaticObservationAdapter returns fixed text observations.
 * Useful for tests and simple integrations.
 */

import type { ObservationAdapter } from './observation-adapter';
import type { RawTextObservation } from './types';

export class StaticObservationAdapter implements ObservationAdapter {
  constructor(private readonly observations: RawTextObservation) {}

  async getObservations(): Promise<RawTextObservation> {
    return { ...this.observations };
  }
}
