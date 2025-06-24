import { StarshipConfig } from '@starship-ci/types';
import { join, resolve } from 'path';

export const outputDir = resolve(join(__dirname, '../__output__'));

// Based on starship/tests/e2e/configs/one-chain.yaml
export const singleChainConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 1,
      metrics: true,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8003,
        'grpc-web': 9091
      },
      resources: {
        cpu: '0.5',
        memory: '500M'
      },
      faucet: {
        enabled: true,
        type: 'starship',
        concurrency: 2
      },
      balances: [
        {
          address: 'osmo1e9ucjn5fjmetky5wezzcsccp7hqcwzrrhthpf5',
          amount: '2000000000000uosmo'
        }
      ],
      genesis: {
        app_state: {
          staking: {
            params: {
              unbonding_time: '5s'
            }
          },
          gamm: {
            params: {
              pool_creation_fee: [
                {
                  amount: '500000',
                  denom: 'uosmo'
                }
              ]
            }
          }
        }
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/multi-validator.yaml
export const multiValidatorConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 2,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8000
      },
      resources: {
        cpu: '0.3',
        memory: '600M'
      },
      faucet: {
        enabled: true,
        type: 'starship',
        concurrency: 2,
        resources: {
          cpu: '0.1',
          memory: '200M'
        }
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/one-custom-chain.yaml
export const customChainConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'custom-1',
      name: 'custom',
      numValidators: 1,
      image: 'anmol1696/osmosis:latest',
      home: '/root/.osmosisd',
      binary: 'osmosisd',
      prefix: 'osmo',
      denom: 'uosmo',
      coins: '100000000000000uosmo,100000000000000uion',
      hdPath: "m/44'/118'/0'/0/0",
      coinType: 118,
      repo: 'https://github.com/osmosis-labs/osmosis',
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8003
      },
      resources: {
        cpu: '0.5',
        memory: '500M'
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/one-chain-cosmjs-faucet.yaml
export const cosmjsFaucetConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 1,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8003
      },
      resources: {
        cpu: '0.5',
        memory: '500M'
      },
      faucet: {
        enabled: true,
        type: 'cosmjs',
        concurrency: 2
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/build-chain.yaml
export const buildChainConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'core-1',
      name: 'persistencecore',
      numValidators: 2,
      build: {
        enabled: true,
        source: 'v7.0.0'
      },
      ports: {
        rest: 1318,
        rpc: 26658,
        exposer: 38088
      },
      resources: {
        cpu: '2',
        memory: '2Gi'
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/one-chain-cometmock.yaml
export const cometmockConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'cosmoshub-4',
      name: 'cosmoshub',
      numValidators: 1,
      ports: {
        rpc: 26653,
        exposer: 38083
      },
      resources: {
        cpu: '0.3',
        memory: '300M'
      },
      faucet: {
        enabled: false
      },
      cometmock: {
        enabled: true,
        image: 'ghcr.io/informalsystems/cometmock:v0.37.x'
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/two-chain.yaml (but only chains, no relayers)
export const twoChainConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 2,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8001
      }
    },
    {
      id: 'cosmoshub-4',
      name: 'cosmoshub',
      numValidators: 2,
      faucet: {
        enabled: false
      },
      ports: {
        rest: 1317,
        rpc: 26657,
        exposer: 38087
      }
    }
  ]
};

// Ethereum chain (should be skipped by generator)
export const ethereumConfig: StarshipConfig = {
  name: 'starship-generator-test',
  chains: [
    {
      id: 1337,
      name: 'ethereum',
      numValidators: 1,
      ports: {
        rest: 8545,
        rpc: 8551
      }
    }
  ]
};

// Based on starship/tests/e2e/configs/two-chain.yaml
export const twoChainWithHermesConfig: StarshipConfig = {
  name: 'starship-generator-test',
  version: '4.0.0',
  chains: [
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 2,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8001
      }
    },
    {
      id: 'cosmoshub-4',
      name: 'cosmoshub',
      numValidators: 2,
      faucet: {
        enabled: false
      },
      ports: {
        rest: 1317,
        rpc: 26657,
        exposer: 38087
      }
    }
  ],
  relayers: [
    {
      name: 'osmos-cosmos',
      type: 'hermes',
      replicas: 1,
      chains: ['osmosis-1', 'cosmoshub-4'],
      config: {
        global: {
          log_level: 'info'
        },
        rest: {
          enabled: true
        },
        telemetry: {
          enabled: false
        },
        event_source: {
          mode: 'pull'
        }
      },
      ports: {
        rest: 3000,
        exposer: 3002
      }
    }
  ],
  explorer: {
    enabled: true,
    type: 'ping-pub',
    ports: {
      rest: 8080
    }
  },
  registry: {
    enabled: true,
    image: 'ghcr.io/cosmology-tech/starship/registry:latest',
    ports: {
      rest: 8081
    }
  }
};

// Based on starship/tests/e2e/configs/two-chain-gorelayer.yaml
export const twoChainWithGoRelayerConfig: StarshipConfig = {
  name: 'starship-generator-test',
  version: '4.0.0',
  chains: [
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 2,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8001
      }
    },
    {
      id: 'cosmoshub-4',
      name: 'cosmoshub',
      numValidators: 2,
      ports: {
        rest: 1317,
        rpc: 26657,
        exposer: 38087,
        faucet: 8000
      }
    }
  ],
  relayers: [
    {
      name: 'osmos-cosmos',
      type: 'go-relayer',
      replicas: 1,
      chains: ['osmosis-1', 'cosmoshub-4']
    }
  ],
  registry: {
    enabled: true,
    image: 'ghcr.io/cosmology-tech/starship/registry:latest',
    ports: {
      rest: 8081
    }
  }
};

// Config for testing neutron query relayer
export const neutronRelayerConfig: StarshipConfig = {
  name: 'starship-generator-test',
  version: '4.0.0',
  chains: [
    {
      id: 'neutron-1',
      name: 'neutron',
      numValidators: 1,
      prefix: 'neutron',
      denom: 'untrn',
      home: '/root/.neutrond',
      ports: {
        rest: 1317,
        rpc: 26657,
        exposer: 38087
      }
    },
    {
      id: 'osmosis-1',
      name: 'osmosis',
      numValidators: 1,
      ports: {
        rest: 1313,
        rpc: 26653,
        exposer: 38083,
        faucet: 8001
      }
    }
  ],
  relayers: [
    {
      name: 'neutron-query',
      type: 'neutron-query-relayer',
      replicas: 1,
      chains: ['neutron-1', 'osmosis-1'],
      config: {
        RELAYER_NEUTRON_CHAIN_TIMEOUT: '1000s',
        RELAYER_NEUTRON_CHAIN_GAS_PRICES: '0.5untrn'
      }
    }
  ]
};
