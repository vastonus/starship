import axios from 'axios';

import { Chain, StarshipConfig } from './config';

export interface VerificationResult {
  service: string;
  endpoint: string;
  status: 'success' | 'failure' | 'skipped';
  message?: string;
  error?: string;
  details?: any;
}

export type VerificationFunction = (
  config: StarshipConfig
) => Promise<VerificationResult[]>;

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
          results.push(...result);
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

export const verifyChainLocalRest = async (
  chain: Chain
): Promise<VerificationResult> => {
  const port = chain.ports?.rest;
  const result: VerificationResult = {
    service: `chain-${chain.id}`,
    endpoint: 'rest',
    status: 'failure'
  };

  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return result;
  }

  try {
    // Get the supply of the chain, should work for most chains
    const response = await axios.get(
      `http://localhost:${port}/cosmos/bank/v1beta1/supply`
    );
    result.details = response.data;
    if (response.status !== 200) {
      result.error = 'Failed to get chain supply';
      return result;
    }
    // check supply is greater than 0
    if (response.data.supply[0].amount > 0) {
      result.status = 'success';
      result.message = 'Chain supply is greater than 0';
      return result;
    }

    result.status = 'failure';
    result.error = 'Chain supply not confirmed';
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
};

export const verifyChainLocalRpc = async (
  chain: Chain
): Promise<VerificationResult> => {
  const port = chain.ports?.rpc;
  const result: VerificationResult = {
    service: `chain-${chain.id}`,
    endpoint: 'rpc',
    status: 'failure'
  };

  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return result;
  }

  try {
    // Get the supply of the chain, should work for most chains
    const response = await axios.get(`http://localhost:${port}/status`);
    result.details = response.data;
    if (response.status !== 200) {
      result.error = 'Failed to get chain node info';
      return result;
    }

    const blockHeight = Number(
      response.data.result?.sync_info?.latest_block_height || response.data.result?.SyncInfo?.latest_block_height
    );

    if (blockHeight > 0) {
      result.status = 'success';
      result.message = 'Chain is synced';
      return result;
    }

    result.status = 'failure';
    result.error = 'Block height is 0';
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
};

export const verifyChainLocalFaucet = async (
  chain: Chain
): Promise<VerificationResult> => {
  const port = chain.ports?.faucet;
  const result: VerificationResult = {
    service: `chain-${chain.id}`,
    endpoint: 'faucet',
    status: 'failure'
  };

  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return result;
  }

  try {
    const response = await axios.get(`http://localhost:${port}/status`);
    if (response.status !== 200) {
      result.error = 'Failed to get chain node info';
      return result;
    }

    // check if the faucet chainId is in the response
    if (response.data.chainId === chain.id) {
      result.status = 'success';
      result.message = 'Chain faucet is working';
      return result;
    }

    result.status = 'failure';
    result.error = 'Chain faucet is not working';
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
};

export const verifyChainLocalExposer = async (
  chain: Chain
): Promise<VerificationResult> => {
  const port = chain.ports?.exposer;
  const result: VerificationResult = {
    service: `chain-${chain.id}`,
    endpoint: 'exposer',
    status: 'failure'
  };

  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return result;
  }

  try {
    const response = await axios.get(`http://localhost:${port}/node_id`);
    if (response.status !== 200) {
      result.error = 'Failed to get chain node id';
      return result;
    }

    if (response.data.nodeId) {
      result.status = 'success';
      result.message = 'Chain exposer is working';
      return result;
    }

    result.details = response.data;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
};

export const verifyRegistryLocalRest = async (
  config: StarshipConfig
): Promise<VerificationResult[]> => {
  const port = config.registry?.ports?.rest;
  const result: VerificationResult = {
    service: `registry`,
    endpoint: 'rest',
    status: 'failure'
  };

  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return [result];
  }

  try {
    const response = await axios.get(`http://localhost:${port}/chains`);
    result.details = response.data;
    if (response.status !== 200) {
      result.error = 'Failed to get registry chains';
      return [result];
    }

    if (response.data.chains?.length > 0) {
      result.status = 'success';
      result.message = 'Registry is working';
      return [result];
    }

    result.status = 'failure';
    result.error = 'Registry is not working';
    return [result];
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return [result];
  }
};

export const verifyExplorerLocalRest = async (
  config: StarshipConfig
): Promise<VerificationResult[]> => {
  const port = config.explorer?.ports?.rest;
  const result: VerificationResult = {
    service: `explorer`,
    endpoint: 'rest',
    status: 'failure'
  };

  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return [result];
  }

  try {
    const response = await axios.get(`http://localhost:${port}`);
    result.details = response.data;

    console.log('response.data', response.data);

    if (response.status !== 200) {
      result.error = 'Failed to get explorer status';
      return [result];
    }

    // check if the response has 'Ping Dashboard' in the body
    if (response.data.includes('Ping Dashboard')) {
      result.status = 'success';
      result.message = 'Explorer is working';
      return [result];
    }

    result.status = 'failure';
    result.error = 'Explorer is not working';
    return [result];
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return [result];
  }
};

// Default verifiers
export const createDefaultVerifiers = (registry: VerificationRegistry) => {
  // Chain REST endpoint verification
  registry.register('chain', async (config) => {
    const results: VerificationResult[] = [];

    for (const chain of config.chains) {
      results.push(await verifyChainLocalRest(chain));
      results.push(await verifyChainLocalRpc(chain));
      results.push(await verifyChainLocalFaucet(chain));
      results.push(await verifyChainLocalExposer(chain));
    }

    return results;
  });

  // Registry verification
  registry.register('registry', async (config) => {
    const results: VerificationResult[] = [];
    results.push(...(await verifyRegistryLocalRest(config)));
    return results;
  });

  // Explorer verification
  registry.register('explorer', async (config) => {
    const results: VerificationResult[] = [];
    results.push(...(await verifyExplorerLocalRest(config)));
    return results;
  });
};
