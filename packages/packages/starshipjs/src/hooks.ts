import { ChainRegistryFetcher } from '@chain-registry/client';
import fs from 'fs';
import yaml from 'js-yaml';
import fetch from 'node-fetch';

import { Chain, Relayer, StarshipConfig } from '@starship-ci/types';

import { ConfigContext } from './config';

interface ChainHook {
  chain: any;
  chainInfo: any;
  getCoin: () => Promise<any>;
  getRpcEndpoint: () => Promise<string>;
  getRestEndpoint: () => Promise<string>;
  getGenesisMnemonic: () => Promise<string>;
  creditFromFaucet: (address: string, denom?: string | null) => Promise<void>;
}

export const useRegistry = async (
  configFile: string
): Promise<ChainRegistryFetcher> => {
  const config = yaml.load(fs.readFileSync(configFile, 'utf8')) as StarshipConfig;
  const registryUrl = `http://localhost:${config.registry.ports.rest}`;

  const urls: string[] = [];
  config.chains?.forEach((chain: Chain) => {
    urls.push(
      `${registryUrl}/chains/${chain.id}`,
      `${registryUrl}/chains/${chain.id}/assets`
    );
  });
  config.relayers?.forEach((relayer: Relayer) => {
    urls.push(
      `${registryUrl}/ibc/${relayer.chains[0]}/${relayer.chains[1]}`,
      `${registryUrl}/ibc/${relayer.chains[1]}/${relayer.chains[0]}`
    );
  });

  const options = {
    urls
  };
  const registry = new ChainRegistryFetcher(options);
  await registry.fetchUrls();

  return registry;
};

export const useChain = (chainName: string): ChainHook | undefined => {
  const registry = ConfigContext.registry;
  const configFile = ConfigContext.configFile;
  const config = yaml.load(fs.readFileSync(configFile, 'utf8')) as StarshipConfig;

  const chain = registry!.getChain(chainName);
  const chainInfo = registry!.getChainInfo(chainName);
  const chainID = chainInfo.chain.chainId;

  const getRpcEndpoint = async () => {
    return `http://localhost:${
      config.chains.find((chain: Chain) => chain.id === chainID)!.ports.rpc
    }`;
  };
  const getRestEndpoint = async () => {
    return `http://localhost:${
      config.chains.find((chain: Chain) => chain.id === chainID)!.ports.rest
    }`;
  };

  const getGenesisMnemonic = async () => {
    const url = `http://localhost:${config.registry.ports.rest}/chains/${chainID}/keys`;
    const response = await fetch(url, {});
    const data = await response.json();
    return data['genesis'][0]['mnemonic'];
  };

  const getCoin = async () => {
    return chainInfo.fetcher.getChainAssetList(chainName).assets[0];
  };

  const creditFromFaucet = async (
    address: string,
    denom: string | null = null
  ) => {
    const faucetEndpoint = `http://localhost:${
      config.chains.find((chain: Chain) => chain.id === chainID)!.ports.faucet
    }/credit`;
    if (!denom) {
      denom = (await getCoin()).base;
    }
    await fetch(faucetEndpoint, {
      method: 'POST',
      body: JSON.stringify({
        address,
        denom
      }),
      headers: {
        'Content-type': 'application/json'
      }
    });
  };

  return {
    chain,
    chainInfo,
    getCoin,
    getRpcEndpoint,
    getRestEndpoint,
    getGenesisMnemonic,
    creditFromFaucet
  };
};
