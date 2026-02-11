/**
 * ObservationAdapter yields text-based observations for the agent.
 * Text-only; no multimodal inputs (images/audio) in this interface.
 */

import type { RawTextObservation } from './types';

/**
 * Adapter that provides raw text observations from external sources.
 * Implementations might poll APIs, read from queues, or return static data.
 */
export interface ObservationAdapter {
  /**
   * Fetches the current text-based observations.
   * Keys identify the observation source; values are raw text strings.
   */
  getObservations(): Promise<RawTextObservation>;
}
