import axios from 'axios';

import { Chain, Relayer, StarshipConfig } from './config';
import { handleAxiosError } from './utils';

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
    result.error = handleAxiosError(error);
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
      response.data.result?.sync_info?.latest_block_height ||
        response.data.result?.SyncInfo?.latest_block_height
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
    result.error = handleAxiosError(error);
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
    result.error = handleAxiosError(error);
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
    result.error = handleAxiosError(error);
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
    result.error = handleAxiosError(error);
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
    const response = await axios.get(`http://localhost:${port}`, {
      headers: {
        Accept: 'text/html'
      }
    });
    result.details = response.data;

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
    result.error = handleAxiosError(error);
    return [result];
  }
};

export const verifyRelayerLocalRest = async (
  relayer: Relayer
): Promise<VerificationResult> => {
  const result: VerificationResult = {
    service: `relayer-${relayer.name}`,
    endpoint: 'rest',
    status: 'failure'
  };

  const port = relayer.ports?.rest;
  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return result;
  }

  try {
    const response = await axios.get(`http://localhost:${port}/version`);
    result.details = response.data;
    if (response.status !== 200) {
      result.error = 'Failed to get relayer version';
      return result;
    }

    // Check if relayer is running and has active connections
    if (response.data.status === 'success') {
      result.status = 'success';
      result.message = 'Relayer is running';
      return result;
    }

    result.status = 'failure';
    result.error = 'Relayer is not in success state';
    return result;
  } catch (error) {
    result.error = handleAxiosError(error);
    return result;
  }
};

export const verifyRelayerLocalExposer = async (
  relayer: Relayer
): Promise<VerificationResult> => {
  const result: VerificationResult = {
    service: `relayer-${relayer.name}`,
    endpoint: 'exposer',
    status: 'failure'
  };

  const port = relayer.ports?.exposer;
  if (!port) {
    result.status = 'skipped';
    result.error = 'Port not found';
    return result;
  }

  try {
    const response = await axios.get(`http://localhost:${port}/config`);
    result.details = response.data;
    if (response.status !== 200) {
      result.error = 'Failed to get relayer config';
      return result;
    }

    // Check if config contains required fields
    if (response.data.chains && response.data.chains.length > 0) {
      result.status = 'success';
      result.message = 'Relayer exposer is working with valid config';
      return result;
    }

    result.status = 'failure';
    result.error = 'Relayer config is invalid or empty';
    return result;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 500) {
      const errorBody = error.response.data;
      if (
        errorBody.code === 2 &&
        errorBody.message === 'open : no such file or directory' &&
        Array.isArray(errorBody.details) &&
        errorBody.details.length === 0
      ) {
        result.status = 'success';
        result.message = 'Relayer exposer is working with empty config';
        return result;
      }
    }
    result.error = handleAxiosError(error);
    return result;
  }
};

// Default verifiers
export const createDefaultVerifiers = (registry: VerificationRegistry) => {
  // Chain REST endpoint verification
  registry.register('chain', async (config) => {
    const results: VerificationResult[] = [];

    for (const chain of config.chains) {
      const chainResults = await Promise.all([
        verifyChainLocalRest(chain),
        verifyChainLocalRpc(chain),
        verifyChainLocalFaucet(chain),
        verifyChainLocalExposer(chain)
      ]);
      results.push(...chainResults);
    }

    for (const relayer of config.relayers || []) {
      const relayerResults = await Promise.all([
        verifyRelayerLocalRest(relayer),
        verifyRelayerLocalExposer(relayer)
      ]);
      results.push(...relayerResults);
    }
    return results;
  });

  // Registry verification
  registry.register('registry', verifyRegistryLocalRest);

  // Explorer verification
  registry.register('explorer', verifyExplorerLocalRest);
};
