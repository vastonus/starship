import { StarshipConfig } from '@starship-ci/types';
import { ConfigMap, Deployment, Service } from 'kubernetesjs';

import * as helpers from '../helpers';
import { IGenerator, Manifest } from '../types';

/**
 * ConfigMap generator for Registry service
 * Handles chain configurations and asset lists
 */
export class RegistryConfigMapGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<ConfigMap> {
    const chainConfigs: Record<string, string> = {};
    const assetLists: Record<string, string> = {};

    this.config.chains.forEach((chain) => {
      const hostname = helpers.getChainName(String(chain.id));
      chainConfigs[`${hostname}.json`] = JSON.stringify({
        chain_name: chain.name,
        api: {
          rpc: `http://${hostname}-genesis.$(NAMESPACE).svc.cluster.local:26657`,
          grpc: `http://${hostname}-genesis.$(NAMESPACE).svc.cluster.local:9090`,
          rest: `http://${hostname}-genesis.$(NAMESPACE).svc.cluster.local:1317`
        },
        assets: chain.assets || []
      });

      assetLists[`${hostname}.json`] = JSON.stringify({
        chain_name: chain.name,
        assets: chain.assets || []
      });
    });

    return [
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'registry-config',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'registry',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        data: {
          ...chainConfigs,
          ...assetLists
        }
      }
    ];
  }
}

/**
 * Service generator for Registry service
 */
export class RegistryServiceGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Service> {
    return [
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'registry',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'registry',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        spec: {
          selector: {
            app: 'registry'
          },
          ports: [
            {
              name: 'http',
              port: 8080,
              targetPort: '8080'
            },
            {
              name: 'grpc',
              port: 9090,
              targetPort: '9090'
            }
          ]
        }
      }
    ];
  }
}

/**
 * Deployment generator for Registry service
 */
export class RegistryDeploymentGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Deployment> {
    const volumeMounts = this.config.chains.map((chain) => ({
      name: `chain-${helpers.getChainName(String(chain.id))}`,
      mountPath: `/chains/${chain.id}`
    }));

    const volumes = this.config.chains.map((chain) => ({
      name: `chain-${helpers.getChainName(String(chain.id))}`,
      configMap: {
        name: `chain-${helpers.getChainName(String(chain.id))}`
      }
    }));

    return [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'registry',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'registry',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: 'registry'
            }
          },
          template: {
            metadata: {
              labels: {
                app: 'registry',
                ...helpers.getCommonLabels(this.config)
              }
            },
            spec: {
              containers: [
                {
                  name: 'registry',
                  image: this.config.registry?.image,
                  ports: [
                    {
                      name: 'http',
                      containerPort: 8080
                    },
                    {
                      name: 'grpc',
                      containerPort: 9090
                    }
                  ],
                  env: [
                    {
                      name: 'REGISTRY_CHAIN_CLIENT_RPCS',
                      value: helpers.getChainRpcAddrs(
                        this.config.chains,
                        this.config
                      )
                    },
                    {
                      name: 'REGISTRY_CHAIN_API_RPCS',
                      value: helpers.getChainRpcAddrs(
                        this.config.chains,
                        this.config
                      )
                    },
                    {
                      name: 'REGISTRY_CHAIN_API_GRPCS',
                      value: helpers.getChainGrpcAddrs(
                        this.config.chains,
                        this.config
                      )
                    },
                    {
                      name: 'REGISTRY_CHAIN_API_RESTS',
                      value: helpers.getChainRestAddrs(
                        this.config.chains,
                        this.config
                      )
                    },
                    {
                      name: 'REGISTRY_CHAIN_CLIENT_EXPOSERS',
                      value: helpers.getChainExposerAddrs(
                        this.config.chains
                      )
                    }
                  ],
                  volumeMounts,
                  resources: helpers.getResourceObject(
                    this.config.registry?.resources
                  ),
                  readinessProbe: {
                    httpGet: {
                      path: '/health',
                      port: '8080'
                    },
                    initialDelaySeconds: 5,
                    periodSeconds: 10
                  },
                  livenessProbe: {
                    httpGet: {
                      path: '/health',
                      port: '8080'
                    },
                    initialDelaySeconds: 15,
                    periodSeconds: 20
                  }
                }
              ],
              volumes
            }
          }
        }
      }
    ];
  }
}

/**
 * Main Registry builder
 * Orchestrates ConfigMap, Service, and Deployment generation and file output
 */
export class RegistryBuilder implements IGenerator {
  private config: StarshipConfig;
  private generators: Array<IGenerator>;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.generators = [
      new RegistryConfigMapGenerator(config),
      new RegistryServiceGenerator(config),
      new RegistryDeploymentGenerator(config)
    ];
  }

  generate(): Array<Manifest> {
    if (!this.config.registry || this.config.registry?.enabled === false) {
      return [];
    }

    return this.generators.flatMap((generator) => generator.generate());
  }
}
