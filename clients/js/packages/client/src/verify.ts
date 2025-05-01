import axios from 'axios';

import { StarshipConfig } from './config';

export interface VerificationResult {
  service: string;
  endpoint: string;
  status: 'success' | 'failure' | 'skipped';
  error?: string;
  details?: any;
}

export type VerificationFunction = (
  config: StarshipConfig
) => Promise<VerificationResult>;

export class VerificationRegistry {
  private verifiers: Map<string, VerificationFunction[]> = new Map();

  register(service: string, verifier: VerificationFunction) {
    if (!this.verifiers.has(service)) {
      this.verifiers.set(service, []);
    }
    this.verifiers.get(service)!.push(verifier);
  }

  async run(config: StarshipConfig): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    for (const [service, verifiers] of this.verifiers.entries()) {
      for (const verifier of verifiers) {
        try {
          const result = await verifier(config);
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
  registry.register('chain', async (config) => {
    const results: VerificationResult[] = [];

    for (const chain of config.chains) {
      const port = chain.ports?.rest;
      if (!port) {
        results.push({
          service: `chain-${chain.id}`,
          endpoint: 'rest',
          status: 'skipped',
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
  registry.register('registry', async (config) => {
    const port = config.registry?.ports?.rest;
    if (!port) {
      return {
        service: 'registry',
        endpoint: 'rest',
        status: 'skipped',
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
  registry.register('explorer', async (config) => {
    const port = config.explorer?.ports?.rest;
    if (!port) {
      return {
        service: 'explorer',
        endpoint: 'rest',
        status: 'skipped',
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
