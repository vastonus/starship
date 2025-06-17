import { StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ConfigMap, Service, Deployment } from 'kubernetesjs';
import * as path from 'path';

import { DefaultsManager } from '../defaults';
import { TemplateHelpers } from '../helpers';
import { GeneratorContext } from '../types';

/**
 * ConfigMap generator for Registry service
 * Handles chain configurations and asset lists
 */
export class RegistryConfigMapGenerator {
  private defaultsManager: DefaultsManager;
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.defaultsManager = new DefaultsManager();
    this.config = config;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': 'registry',
      'app.kubernetes.io/type': 'registry-configmap'
    };
  }

  /**
   * Create ConfigMap for chain configurations
   */
  chainConfigMap(): ConfigMap {
    const data: Record<string, string> = {};
    const defaultFile = this.defaultsManager.getAllDefaults();

    for (const chain of this.config.chains) {
      const processedChain = this.defaultsManager.processChain(chain);
      const host = this.config.registry?.localhost 
        ? 'localhost' 
        : `${processedChain.hostname}-genesis.${this.config.name}.svc.cluster.local`;

      // Generate chain.json
      data[`${processedChain.id}.json`] = JSON.stringify({
        $schema: '../chain.schema.json',
        chain_name: processedChain.name === 'custom' ? processedChain.id : processedChain.name,
        status: 'live',
        network_type: 'devnet',
        chain_id: processedChain.id,
        pretty_name: `${processedChain.prettyName} Devnet`,
        bech32_prefix: processedChain.prefix,
        daemon_name: processedChain.binary,
        node_home: processedChain.home,
        key_algos: ['secp256k1'],
        slip44: processedChain.coinType,
        fees: {
          fee_tokens: [
            {
              denom: processedChain.denom,
              fixed_min_gas_price: 0,
              low_gas_price: 0,
              average_gas_price: 0.025,
              high_gas_price: 0.04
            }
          ]
        },
        staking: {
          staking_tokens: [
            {
              denom: processedChain.denom
            }
          ],
          lock_duration: {
            time: '1209600s'
          }
        },
        codebase: {
          git_repo: processedChain.repo,
          compatible_versions: [],
          binaries: {},
          ics_enabled: [],
          versions: [],
          consensus: {
            type: 'tendermint'
          }
        },
        ...(this.config.explorer?.enabled && {
          explorers: [
            {
              kind: this.config.explorer.type,
              url: `http://localhost:${this.config.explorer.ports?.rest}`
            }
          ]
        }),
        peers: {
          seeds: [],
          persistent_peers: []
        }
      }, null, 2);

      // Generate assetlist.json
      data[`${processedChain.id}-assetlist.json`] = JSON.stringify({
        $schema: '../assetlist.schema.json',
        chain_name: processedChain.name === 'custom' ? processedChain.id : processedChain.name,
        assets: processedChain.assets || [
          {
            description: `The denom for token ${processedChain.denom}`,
            base: processedChain.denom,
            name: processedChain.denom,
            display: processedChain.denom,
            symbol: processedChain.denom.toUpperCase(),
            denom_units: [
              {
                denom: processedChain.denom,
                exponent: 0
              },
              {
                denom: processedChain.denom,
                exponent: 6
              }
            ],
            coingecko_id: processedChain.name
          }
        ]
      }, null, 2);
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'registry',
        labels: this.labels()
      },
      data
    };
  }
}

/**
 * Service generator for Registry service
 */
export class RegistryServiceGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': 'registry',
      'app.kubernetes.io/type': 'registry-service'
    };
  }

  /**
   * Create Service for registry
   */
  service(): Service {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'registry',
        labels: this.labels()
      },
      spec: {
        clusterIP: 'None',
        ports: [
          {
            name: 'http',
            port: 8080,
            protocol: 'TCP',
            targetPort: 8080
          },
          {
            name: 'grpc',
            port: 9090,
            protocol: 'TCP',
            targetPort: 9090
          }
        ],
        selector: {
          'app.kubernetes.io/name': 'registry'
        }
      }
    };
  }
}

/**
 * Deployment generator for Registry service
 */
export class RegistryDeploymentGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': 'registry',
      'app.kubernetes.io/type': 'registry-deployment'
    };
  }

  /**
   * Create Deployment for registry
   */
  deployment(): Deployment {
    const listIDs = this.config.chains.map(chain => chain.id);
    const exposerPort = this.config.exposer?.ports?.rest || 8081;

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'registry',
        labels: this.labels()
      },
      spec: {
        replicas: 1,
        revisionHistoryLimit: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/instance': 'registry',
            'app.kubernetes.io/name': 'registry'
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
              'app.kubernetes.io/instance': 'registry',
              'app.kubernetes.io/type': 'registry',
              'app.kubernetes.io/name': 'registry',
              'app.kubernetes.io/rawname': 'registry',
              'app.kubernetes.io/version': this.config.version || '1.8.0'
            }
          },
          spec: {
            ...(this.config.registry?.imagePullSecrets
              ? TemplateHelpers.generateImagePullSecrets(this.config.registry.imagePullSecrets)
              : {}),
            initContainers: [
              {
                name: 'wait',
                image: 'busybox:1.34.1',
                command: [
                  'sh',
                  '-c',
                  `until wget -q --spider http://localhost:${exposerPort}/ready; do echo "Waiting for exposer..."; sleep 2; done`
                ]
              }
            ],
            containers: [
              {
                name: 'registry',
                image: this.config.registry?.image || 'ghcr.io/cosmology-tech/starship/registry:latest',
                imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
                env: [
                  {
                    name: 'NAMESPACE',
                    valueFrom: {
                      fieldRef: {
                        fieldPath: 'metadata.namespace'
                      }
                    }
                  },
                  {
                    name: 'REGISTRY_CHAIN_CLIENT_IDS',
                    value: listIDs.join(',')
                  },
                  {
                    name: 'REGISTRY_CHAIN_CLIENT_NAMES',
                    value: this.config.chains.map(chain => chain.name).join(',')
                  },
                  {
                    name: 'REGISTRY_CHAIN_CLIENT_RPCS',
                    value: this.config.chains.map(chain => 
                      `http://${chain.hostname}-genesis.${this.config.name}.svc.cluster.local:${chain.ports?.rpc || 26657}`
                    ).join(',')
                  },
                  {
                    name: 'REGISTRY_CHAIN_API_RPCS',
                    value: this.config.chains.map(chain => 
                      `http://${chain.hostname}-genesis.${this.config.name}.svc.cluster.local:${chain.ports?.rpc || 26657}`
                    ).join(',')
                  },
                  {
                    name: 'REGISTRY_CHAIN_API_GRPCS',
                    value: this.config.chains.map(chain => 
                      `${chain.hostname}-genesis.${this.config.name}.svc.cluster.local:${chain.ports?.grpc || 9090}`
                    ).join(',')
                  },
                  {
                    name: 'REGISTRY_CHAIN_API_RESTS',
                    value: this.config.chains.map(chain => 
                      `http://${chain.hostname}-genesis.${this.config.name}.svc.cluster.local:${chain.ports?.rest || 1317}`
                    ).join(',')
                  },
                  {
                    name: 'REGISTRY_CHAIN_REGISTRY',
                    value: '/configs'
                  },
                  {
                    name: 'REGISTRY_CHAIN_CLIENT_EXPOSERS',
                    value: this.config.chains.map(chain => 
                      `http://${chain.hostname}-genesis.${this.config.name}.svc.cluster.local:${exposerPort}`
                    ).join(',')
                  }
                ],
                command: ['registry'],
                resources: TemplateHelpers.getResourceObject(
                  this.config.registry?.resources || { cpu: '0.1', memory: '128M' }
                ),
                volumeMounts: this.config.chains.map(chain => ({
                  mountPath: `/configs/${chain.id}`,
                  name: `registry-configs-${chain.hostname}`
                })),
                readinessProbe: {
                  tcpSocket: {
                    port: 8080
                  },
                  initialDelaySeconds: 20,
                  periodSeconds: 10
                },
                livenessProbe: {
                  tcpSocket: {
                    port: 8080
                  },
                  initialDelaySeconds: 20,
                  periodSeconds: 10
                }
              }
            ],
            volumes: this.config.chains.map(chain => ({
              name: `registry-configs-${chain.hostname}`,
              configMap: {
                name: `registry-${chain.hostname}`
              }
            }))
          }
        }
      }
    };
  }
}

/**
 * Main Registry builder
 * Orchestrates ConfigMap, Service, and Deployment generation and file output
 */
export class RegistryBuilder {
  private defaultsManager: DefaultsManager;
  private context: GeneratorContext;
  private outputDir?: string;

  constructor(context: GeneratorContext, outputDir?: string) {
    this.context = context;
    this.outputDir = outputDir;
    this.defaultsManager = new DefaultsManager();
  }

  /**
   * Build all Kubernetes manifests for the Registry service
   */
  buildManifests(): Array<ConfigMap | Service | Deployment> {
    if (!this.context.config.registry?.enabled) {
      return [];
    }

    const manifests: Array<ConfigMap | Service | Deployment> = [];

    // Create generators
    const configMapGenerator = new RegistryConfigMapGenerator(this.context.config);
    const serviceGenerator = new RegistryServiceGenerator(this.context.config);
    const deploymentGenerator = new RegistryDeploymentGenerator(this.context.config);

    // Build ConfigMaps
    manifests.push(configMapGenerator.chainConfigMap());

    // Build Service
    manifests.push(serviceGenerator.service());

    // Build Deployment
    manifests.push(deploymentGenerator.deployment());

    return manifests;
  }

  /**
   * Generate and write YAML files for the Registry service
   */
  generateFiles(outputDir?: string): void {
    const targetDir = outputDir || this.outputDir;
    if (!targetDir) {
      throw new Error(
        'Output directory must be provided either in constructor or method call'
      );
    }

    const manifests = this.buildManifests();

    // Skip if no manifests to write
    if (manifests.length === 0) {
      return;
    }

    this.writeManifests(manifests, targetDir);
  }

  /**
   * Write manifests to the directory structure:
   * registry/
   *   configmap.yaml: chain configurations
   *   service.yaml: registry service
   *   deployment.yaml: registry deployment
   */
  writeManifests(
    manifests: Array<ConfigMap | Service | Deployment>,
    outputDir: string
  ): void {
    const registryDir = path.join(outputDir, 'registry');

    // Create registry directory
    fs.mkdirSync(registryDir, { recursive: true });

    // Separate manifests by type
    const configMaps = manifests.filter(
      (m) => m.kind === 'ConfigMap'
    ) as ConfigMap[];
    const services = manifests.filter((m) => m.kind === 'Service') as Service[];
    const deployments = manifests.filter(
      (m) => m.kind === 'Deployment'
    ) as Deployment[];

    // Write ConfigMaps
    if (configMaps.length > 0) {
      const configMapYaml = configMaps.map((cm) => yaml.dump(cm)).join('---\n');
      fs.writeFileSync(path.join(registryDir, 'configmap.yaml'), configMapYaml);
    }

    // Write Services
    if (services.length > 0) {
      const serviceYaml = services.map((svc) => yaml.dump(svc)).join('---\n');
      fs.writeFileSync(path.join(registryDir, 'service.yaml'), serviceYaml);
    }

    // Write Deployments
    if (deployments.length > 0) {
      const deploymentYaml = deployments
        .map((d) => yaml.dump(d))
        .join('---\n');
      fs.writeFileSync(path.join(registryDir, 'deployment.yaml'), deploymentYaml);
    }
  }
}
