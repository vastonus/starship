import axios from 'axios';

import { StarshipConfig } from './config';

export interface VerificationResult {
  service: string;
  endpoint: string;
  status: 'success' | 'failure';
  error?: string;
  details?: any;
}

export interface VerificationContext {
  config: StarshipConfig;
  localPorts: Map<string, number>;
}

export type VerificationFunction = (
  context: VerificationContext
) => Promise<VerificationResult>;

export class VerificationRegistry {
  private verifiers: Map<string, VerificationFunction[]> = new Map();

  register(service: string, verifier: VerificationFunction) {
    if (!this.verifiers.has(service)) {
      this.verifiers.set(service, []);
    }
    this.verifiers.get(service)!.push(verifier);
  }

  async run(context: VerificationContext): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    for (const [service, verifiers] of this.verifiers.entries()) {
      for (const verifier of verifiers) {
        try {
          const result = await verifier(context);
          results.push(result);
        } catch (error) {
          results.push({
            service,
            endpoint: 'unknown',
            status: 'failure',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return results;
  }
}

// Default verifiers
export const createDefaultVerifiers = (registry: VerificationRegistry) => {
  // Chain REST endpoint verification
  registry.register('chain', async (context) => {
    const results: VerificationResult[] = [];

    for (const chain of context.config.chains) {
      const port = context.localPorts.get(`${chain.id}-rest`);
      if (!port) {
        results.push({
          service: `chain-${chain.id}`,
          endpoint: 'rest',
          status: 'failure',
          error: 'Port not found'
        });
        continue;
      }

      try {
        const response = await axios.get(`http://localhost:${port}/node_info`);
        results.push({
          service: `chain-${chain.id}`,
          endpoint: 'rest',
          status: 'success',
          details: response.data
        });
      } catch (error) {
        results.push({
          service: `chain-${chain.id}`,
          endpoint: 'rest',
          status: 'failure',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results[0]; // Return first result for now
  });

  // Registry verification
  registry.register('registry', async (context) => {
    const port = context.localPorts.get('registry-rest');
    if (!port) {
      return {
        service: 'registry',
        endpoint: 'rest',
        status: 'failure',
        error: 'Port not found'
      };
    }

    try {
      const response = await axios.get(`http://localhost:${port}/status`);
      return {
        service: 'registry',
        endpoint: 'rest',
        status: 'success',
        details: response.data
      };
    } catch (error) {
      return {
        service: 'registry',
        endpoint: 'rest',
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Explorer verification
  registry.register('explorer', async (context) => {
    const port = context.localPorts.get('explorer-rest');
    if (!port) {
      return {
        service: 'explorer',
        endpoint: 'rest',
        status: 'failure',
        error: 'Port not found'
      };
    }

    try {
      const response = await axios.get(`http://localhost:${port}/status`);
      return {
        service: 'explorer',
        endpoint: 'rest',
        status: 'success',
        details: response.data
      };
    } catch (error) {
      return {
        service: 'explorer',
        endpoint: 'rest',
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
};
