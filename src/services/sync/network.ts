/**
 * Connectivity, behind an interface.
 *
 * The sync engine needs two things: "can I reach the network right now?" and "tell me when
 * that changes". Wrapping `expo-network` in three methods keeps the engine testable without a
 * native module, and means swapping the source later (reachability probing, say) touches one
 * file.
 */

import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';

export interface NetworkMonitor {
  isConnected(): Promise<boolean>;
  /** Registers a listener and returns its unsubscribe. */
  subscribe(listener: (connected: boolean) => void): () => void;
}

export function createNetworkMonitor(): NetworkMonitor {
  return {
    async isConnected(): Promise<boolean> {
      try {
        const state = await getNetworkStateAsync();
        return state.isConnected ?? false;
      } catch {
        // If the platform will not say, assume reachable and let the request itself decide.
        // Refusing to try because we could not ask is the worse failure: it would strand logs.
        return true;
      }
    },

    subscribe(listener: (connected: boolean) => void): () => void {
      const subscription = addNetworkStateListener((event) => {
        listener(event.isConnected ?? false);
      });

      return () => subscription.remove();
    },
  };
}

/** Always reports connected. For tests and for contexts where connectivity is not the gate. */
export const alwaysConnected: NetworkMonitor = {
  isConnected: async () => true,
  subscribe: () => () => {},
};
