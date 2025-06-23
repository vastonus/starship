import { StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ConfigMap, Deployment, Service } from 'kubernetesjs';
import * as path from 'path';

import { TemplateHelpers } from '../helpers';

/**
 * ConfigMap generator for Registry service
 * Handles chain configurations and asset lists
 */
export class RegistryConfigMapGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  configMap(): ConfigMap {
    const chainConfigs: Record<string, string> = {};
    const assetLists: Record<string, string> = {};

    this.config.chains.forEach((chain) => {
      const hostname = TemplateHelpers.chainName(String(chain.id));
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

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'registry-config',
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/component': 'registry',
          'app.kubernetes.io/part-of': 'starship'
        }
      },
      data: {
        ...chainConfigs,
        ...assetLists
      }
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

  service(): Service {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'registry',
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
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

  deployment(): Deployment {
    const volumeMounts = this.config.chains.map((chain) => ({
      name: `chain-${TemplateHelpers.chainName(String(chain.id))}`,
      mountPath: `/chains/${chain.id}`
    }));

    const volumes = this.config.chains.map((chain) => ({
      name: `chain-${TemplateHelpers.chainName(String(chain.id))}`,
      configMap: {
        name: `chain-${TemplateHelpers.chainName(String(chain.id))}`
      }
    }));

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'registry',
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
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
              ...TemplateHelpers.commonLabels(this.config)
            }
          },
          spec: {
            containers: [
              {
                name: 'registry',
                image:
                  this.config.registry?.image ||
                  'ghcr.io/cosmology-tech/starship/registry:latest',
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
                    value: TemplateHelpers.chainRpcAddrs(
                      this.config.chains,
                      this.config
                    )
                  },
                  {
                    name: 'REGISTRY_CHAIN_API_RPCS',
                    value: TemplateHelpers.chainRpcAddrs(
                      this.config.chains,
                      this.config
                    )
                  },
                  {
                    name: 'REGISTRY_CHAIN_API_GRPCS',
                    value: TemplateHelpers.chainGrpcAddrs(
                      this.config.chains,
                      this.config
                    )
                  },
                  {
                    name: 'REGISTRY_CHAIN_API_RESTS',
                    value: TemplateHelpers.chainRestAddrs(
                      this.config.chains,
                      this.config
                    )
                  },
                  {
                    name: 'REGISTRY_CHAIN_CLIENT_EXPOSERS',
                    value: TemplateHelpers.chainExposerAddrs(this.config.chains)
                  }
                ],
                volumeMounts,
                resources: TemplateHelpers.getResourceObject(
                  this.config.registry?.resources || {
                    cpu: '0.1',
                    memory: '128M'
                  }
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
    };
  }
}

/**
 * Main Registry builder
 * Orchestrates ConfigMap, Service, and Deployment generation and file output
 */
export class RegistryBuilder {
  private config: StarshipConfig;
  private configMapGenerator: RegistryConfigMapGenerator;
  private serviceGenerator: RegistryServiceGenerator;
  private deploymentGenerator: RegistryDeploymentGenerator;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.configMapGenerator = new RegistryConfigMapGenerator(config);
    this.serviceGenerator = new RegistryServiceGenerator(config);
    this.deploymentGenerator = new RegistryDeploymentGenerator(config);
  }

  /**
   * Build all Kubernetes manifests for the Registry service
   */
  buildManifests(): (ConfigMap | Service | Deployment)[] {
    return [
      this.configMapGenerator.configMap(),
      this.serviceGenerator.service(),
      this.deploymentGenerator.deployment()
    ];
  }

  /**
   * Generate and write YAML files for the Registry service
   */
  generateFiles(outputDir?: string): void {
    const targetDir = outputDir || 'registry';
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
      const deploymentYaml = deployments.map((d) => yaml.dump(d)).join('---\n');
      fs.writeFileSync(
        path.join(registryDir, 'deployment.yaml'),
        deploymentYaml
      );
    }
  }
}
