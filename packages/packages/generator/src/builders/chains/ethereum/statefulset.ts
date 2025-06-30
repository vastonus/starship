import { Chain, StarshipConfig } from '@starship-ci/types';
import {
  Container,
  ResourceRequirements,
  StatefulSet,
  Volume
} from 'kubernetesjs';

import * as helpers from '../../../helpers';
import { IGenerator } from '../../../types';

/**
 * Generates the StatefulSet for Ethereum chain
 * Based on the Helm template: chains/eth/statefulsets.yaml
 */
export class EthereumStatefulSetGenerator implements IGenerator {
  private config: StarshipConfig;
  private chain: Chain;

  constructor(chain: Chain, config: StarshipConfig) {
    this.config = config;
    this.chain = chain;
  }

  generate(): Array<StatefulSet> {
    const name = `${this.chain.name}-${this.chain.id}`;

    return [
      {
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        metadata: {
          name: name,
          labels: {
            ...helpers.getCommonLabels(this.config),
            app: name,
            'app.kubernetes.io/component': 'chain',
            'app.kubernetes.io/name': name,
            'app.kubernetes.io/part-of': helpers.getChainId(this.chain),
            'app.kubernetes.io/role': 'ethereum',
            'starship.io/chain-name': this.chain.name,
            'starship.io/chain-id': helpers.getChainId(this.chain)
          }
        },
        spec: {
          serviceName: name,
          replicas: 1,
          selector: {
            matchLabels: {
              'app.kubernetes.io/instance': name,
              'app.kubernetes.io/name': name
            }
          },
          template: {
            metadata: {
              annotations: {
                quality: 'release',
                role: 'api-gateway',
                sla: 'high',
                tier: 'gateway'
              },
              labels: {
                'app.kubernetes.io/instance': name,
                'app.kubernetes.io/type': name,
                'app.kubernetes.io/name': name,
                'app.kubernetes.io/rawname': String(this.chain.id)
              }
            },
            spec: {
              initContainers: this.createInitContainers(this.chain),
              containers: this.createMainContainers(this.chain),
              volumes: this.createVolumes()
            }
          }
        }
      }
    ];
  }

  private createInitContainers(chain: Chain): Container[] {
    const initContainers: Container[] = [];

    // Init Genesis Beacon container
    initContainers.push(this.createInitGenesisBeaconContainer(chain));

    // Init Genesis Execution container
    initContainers.push(this.createInitGenesisExecutionContainer(chain));

    return initContainers;
  }

  private createInitGenesisBeaconContainer(chain: Chain): Container {
    const prysmctlImage =
      chain.config?.prysmctl?.image ||
      'ghcr.io/hyperweb-io/starship/prysm/cmd/prysmctl:v5.2.0';
    const numValidators = chain.config?.validator?.numValidator || 1;

    return {
      name: 'init-genesis-beacon',
      image: prysmctlImage,
      imagePullPolicy: 'IfNotPresent',
      command: ['bash', '-c'],
      args: [
        `
mkdir -p /ethereum/consensus /ethereum/execution
cp /config/genesis.json /ethereum/execution/genesis.json
cp /config/config.yaml /ethereum/consensus/config.yaml

echo "Initializing genesis"
prysmctl testnet generate-genesis \\
  --fork=capella \\
  --num-validators=${numValidators} \\
  --genesis-time-delay=15 \\
  --output-ssz=/ethereum/consensus/genesis.ssz \\
  --chain-config-file=/ethereum/consensus/config.yaml \\
  --geth-genesis-json-in=/ethereum/execution/genesis.json \\
  --geth-genesis-json-out=/ethereum/execution/genesis.json

echo "Copy secrets over"
cp /config/jwt.hex /etc/secrets/jwt.hex
      `.trim()
      ],
      resources: this.getNodeResources(chain),
      volumeMounts: [
        { name: 'secrets', mountPath: '/etc/secrets' },
        { name: 'config', mountPath: '/config' },
        { name: 'ethereum', mountPath: '/ethereum' }
      ]
    };
  }

  private createInitGenesisExecutionContainer(chain: Chain): Container {
    return {
      name: 'init-genesis-execution',
      image: chain.image,
      imagePullPolicy: 'IfNotPresent',
      command: ['bash', '-c'],
      args: [
        `
echo "Initializing genesis geth"
geth --datadir /ethereum/execution init /ethereum/execution/genesis.json
      `.trim()
      ],
      resources: this.getNodeResources(chain),
      volumeMounts: [
        { name: 'secrets', mountPath: '/etc/secrets' },
        { name: 'config', mountPath: '/config' },
        { name: 'ethereum', mountPath: '/ethereum' }
      ]
    };
  }

  private createMainContainers(chain: Chain): Container[] {
    const containers: Container[] = [];

    // Geth container
    containers.push(this.createGethContainer(chain));

    // Beacon chain container
    containers.push(this.createBeaconChainContainer(chain));

    // Validator container
    containers.push(this.createValidatorContainer(chain));

    return containers;
  }

  private createGethContainer(chain: Chain): Container {
    return {
      name: 'geth',
      image: chain.image,
      imagePullPolicy: 'IfNotPresent',
      env: [
        { name: 'HTTP_PORT', value: '8545' },
        { name: 'WS_PORT', value: '8546' },
        { name: 'RPC_PORT', value: '8551' }
      ],
      command: ['bash', '-c'],
      args: [
        `
echo "Setting UDP buffer size"
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216

echo "Starting execution chain"
geth --datadir /ethereum/execution --http \\
  --http.addr=0.0.0.0 \\
  --http.port=$HTTP_PORT \\
  --http.api=eth,net,web3,debug \\
  --ws --ws.addr=0.0.0.0 \\
  --ws.port=$WS_PORT \\
  --authrpc.addr=0.0.0.0 \\
  --authrpc.port=$RPC_PORT \\
  --nodiscover \\
  --http.corsdomain=* \\
  --ws.api=eth,net,web3 \\
  --ws.origins=* \\
  --http.vhosts=* \\
  --authrpc.vhosts=* \\
  --authrpc.jwtsecret=/etc/secrets/jwt.hex \\
  --unlock=0x123463a4B065722E99115D6c222f267d9cABb524 \\
  --password=/dev/null \\
  --syncmode=snap \\
  --snapshot=false \\
  --networkid=${chain.id} \\
  --verbosity=4 \\
  --maxpeers=50 \\
  --nat=none \\
  --log.vmodule=engine=6
      `.trim()
      ],
      resources: this.getNodeResources(chain),
      volumeMounts: [
        { name: 'ethereum', mountPath: '/ethereum' },
        { name: 'secrets', mountPath: '/etc/secrets' }
      ],
      readinessProbe: {
        exec: {
          command: [
            '/bin/bash',
            '-c',
            `curl -s --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' -H "Content-Type: application/json" -X POST http://localhost:8545 | grep -q '"result":false'`
          ]
        },
        initialDelaySeconds: 15,
        periodSeconds: 10
      }
    };
  }

  private createBeaconChainContainer(chain: Chain): Container {
    const beaconImage =
      chain.config?.beacon?.image ||
      'ghcr.io/hyperweb-io/starship/prysm/beacon-chain:v5.2.0';

    return {
      name: 'beacon-chain',
      image: beaconImage,
      imagePullPolicy: 'Always',
      env: [
        {
          name: 'NAMESPACE',
          valueFrom: {
            fieldRef: {
              fieldPath: 'metadata.namespace'
            }
          }
        }
      ],
      command: ['bash', '-c'],
      args: [
        `
echo "Waiting 30 seconds for execution client to be ready..."
sleep 30

echo "Starting consensus chain"
beacon-chain \\
  --execution-endpoint=http://0.0.0.0:8551 \\
  --jwt-secret=/etc/secrets/jwt.hex \\
  --accept-terms-of-use \\
  --http-host 0.0.0.0 \\
  --rpc-host 0.0.0.0 \\
  --chain-id ${chain.id} \\
  --contract-deployment-block=0 \\
  --datadir /ethereum/consensus \\
  --genesis-state /ethereum/consensus/genesis.ssz \\
  --min-sync-peers=0 \\
  --chain-config-file=/ethereum/consensus/config.yaml \\
  --network-id ${chain.id} \\
  --suggested-fee-recipient=0x123463a4B065722E99115D6c222f267d9cABb524 \\
  --minimum-peers-per-subnet=0 \\
  --force-clear-db
      `.trim()
      ],
      resources: this.getNodeResources(chain),
      volumeMounts: [
        { name: 'ethereum', mountPath: '/ethereum' },
        { name: 'secrets', mountPath: '/etc/secrets' }
      ],
      readinessProbe: {
        httpGet: {
          path: '/eth/v1/node/health',
          port: '3500'
        },
        initialDelaySeconds: 15,
        periodSeconds: 20
      }
    };
  }

  private createValidatorContainer(chain: Chain): Container {
    const validatorImage =
      chain.config?.validator?.image ||
      'ghcr.io/hyperweb-io/starship/prysm/validator:v5.2.0';
    const numValidators = chain.config?.validator?.numValidator || 1;

    return {
      name: 'validator',
      image: validatorImage,
      imagePullPolicy: 'Always',
      env: [
        {
          name: 'NAMESPACE',
          valueFrom: {
            fieldRef: {
              fieldPath: 'metadata.namespace'
            }
          }
        }
      ],
      command: ['bash', '-c'],
      args: [
        `
echo "Waiting 15 seconds for execution client to be ready..."
sleep 20
mkdir -p /ethereum/consensus/validator
echo "Starting validator node"
validator \\
  --accept-terms-of-use \\
  --beacon-rpc-provider=0.0.0.0:4000 \\
  --datadir=/ethereum/consensus/validator \\
  --interop-num-validators=${numValidators} \\
  --interop-start-index=0 \\
  --force-clear-db \\
  --grpc-gateway-host=0.0.0.0 \\
  --chain-config-file=/ethereum/consensus/config.yaml \\
  --monitoring-host=0.0.0.0 \\
  --monitoring-port=8081 \\
  --suggested-fee-recipient=0x0C46c2cAFE097b4f7e1BB868B89e5697eE65f934
      `.trim()
      ],
      resources: this.getNodeResources(chain),
      volumeMounts: [
        { name: 'ethereum', mountPath: '/ethereum' },
        { name: 'secrets', mountPath: '/etc/secrets' }
      ],
      readinessProbe: {
        httpGet: {
          path: '/metrics',
          port: '8081'
        },
        initialDelaySeconds: 20,
        periodSeconds: 30
      }
    };
  }

  private createVolumes(): Volume[] {
    return [
      {
        name: 'config',
        configMap: {
          name: 'config-ethereum'
        }
      },
      {
        name: 'ethereum',
        emptyDir: {}
      },
      {
        name: 'secrets',
        emptyDir: {}
      }
    ];
  }

  private getNodeResources(chain: Chain): ResourceRequirements {
    // Use default resources or chain-specific resources
    const defaultResources = this.config.resources?.node;

    return {
      requests: {
        cpu: chain.resources?.cpu || defaultResources?.cpu,
        memory: chain.resources?.memory || defaultResources?.memory
      },
      limits: {
        cpu: chain.resources?.cpu || defaultResources?.cpu,
        memory: chain.resources?.memory || defaultResources?.memory
      }
    };
  }
}
