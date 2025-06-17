import { StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ConfigMap, Service, Deployment } from 'kubernetesjs';
import * as path from 'path';

import { DefaultsManager } from '../defaults';
import { TemplateHelpers } from '../helpers';
import { GeneratorContext } from '../types';

/**
 * ConfigMap generator for Explorer service
 * Handles chain configurations for the explorer
 */
export class ExplorerConfigMapGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  configMap(): ConfigMap {
    const chainConfigs: Record<string, string> = {};

    if (this.config.chains) {
      for (const chain of this.config.chains) {
        const hostname = TemplateHelpers.chainName(String(chain.id));
        const host = this.config.explorer?.localhost
          ? 'localhost'
          : `${hostname}-genesis.$(NAMESPACE).svc.cluster.local`;

        chainConfigs[`${chain.id}.json`] = JSON.stringify(
          {
            chain_name: chain.id,
            coingecko: chain.name,
            api: this.config.ingress?.enabled
              ? `https://rest.${chain.id}-genesis.${this.config.ingress.host?.replace('*.', '')}`
              : `http://${host}:${chain.ports?.rest || 1317}`,
            rpc: [
              this.config.ingress?.enabled
                ? `https://rpc.${chain.id}-genesis.${this.config.ingress.host?.replace('*.', '')}`
                : `http://${host}:${chain.ports?.rpc || 26657}`,
              this.config.ingress?.enabled
                ? `https://rpc.${chain.id}-genesis.${this.config.ingress.host?.replace('*.', '')}`
                : `http://${host}:${chain.ports?.rpc || 26657}`
            ],
            snapshot_provider: '',
            sdk_version: '0.45.6',
            coin_type: chain.coinType,
            min_tx_fee: '3000',
            addr_prefix: chain.prefix,
            logo: '',
            assets: [
              {
                base: chain.denom,
                symbol: chain.prefix.toUpperCase(),
                exponent: '6',
                coingecko_id: chain.id,
                logo: ''
              }
            ]
          },
          null,
          2
        );
      }
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'explorer',
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/name': 'explorer',
          'app.kubernetes.io/type': 'explorer-configmap'
        }
      },
      data: chainConfigs
    };
  }
}

/**
 * Service generator for Explorer service
 */
export class ExplorerServiceGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': 'explorer',
      'app.kubernetes.io/type': 'explorer-service'
    };
  }

  /**
   * Create Service for explorer
   */
  service(): Service {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'explorer',
        labels: this.labels()
      },
      spec: {
        clusterIP: 'None',
        ports: [
          {
            name: 'http',
            port: 8080,
            protocol: 'TCP',
            targetPort: '8080'
          }
        ],
        selector: {
          'app.kubernetes.io/name': 'explorer'
        }
      }
    };
  }
}

/**
 * Deployment generator for Explorer service
 */
export class ExplorerDeploymentGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': 'explorer',
      'app.kubernetes.io/type': 'explorer-deployment'
    };
  }

  /**
   * Create Deployment for explorer
   */
  deployment(): Deployment {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'explorer',
        labels: this.labels()
      },
      spec: {
        replicas: 1,
        revisionHistoryLimit: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/instance': 'explorer',
            'app.kubernetes.io/name': 'explorer'
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
              'app.kubernetes.io/instance': 'explorer',
              'app.kubernetes.io/type': this.config.explorer?.type || 'ping-pub',
              'app.kubernetes.io/name': 'explorer',
              'app.kubernetes.io/rawname': 'explorer',
              'app.kubernetes.io/version': this.config.version || '1.8.0'
            }
          },
          spec: {
            containers: [
              {
                name: 'explorer',
                image: this.config.explorer?.image || 'ghcr.io/cosmology-tech/starship/explorer:latest',
                imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
                command: ['bash', '-c', 'yarn serve --host 0.0.0.0 --port 8080'],
                resources: TemplateHelpers.getResourceObject(
                  this.config.explorer?.resources || { cpu: '0.1', memory: '128M' }
                ),
                volumeMounts: [
                  {
                    mountPath: '/home/explorer/chains/mainnet',
                    name: 'explorer-configs'
                  }
                ],
                readinessProbe: {
                  tcpSocket: {
                    port: '8080'
                  },
                  initialDelaySeconds: 60,
                  periodSeconds: 30
                },
                livenessProbe: {
                  tcpSocket: {
                    port: '8080'
                  },
                  initialDelaySeconds: 60,
                  periodSeconds: 30
                }
              }
            ],
            volumes: [
              {
                name: 'explorer-configs',
                configMap: {
                  name: 'explorer'
                }
              }
            ]
          }
        }
      }
    };
  }
}

/**
 * Main Explorer builder
 * Orchestrates ConfigMap, Service, and Deployment generation and file output
 */
export class ExplorerBuilder {
  private defaultsManager: DefaultsManager;
  private context: GeneratorContext;
  private outputDir?: string;

  constructor(context: GeneratorContext, outputDir?: string) {
    this.context = context;
    this.outputDir = outputDir;
    this.defaultsManager = new DefaultsManager();
  }

  /**
   * Build all Kubernetes manifests for the Explorer service
   */
  buildManifests(): Array<ConfigMap | Service | Deployment> {
    if (!this.context.config.explorer?.enabled) {
      return [];
    }

    const manifests: Array<ConfigMap | Service | Deployment> = [];

    // Create generators
    const configMapGenerator = new ExplorerConfigMapGenerator(this.context.config);
    const serviceGenerator = new ExplorerServiceGenerator(this.context.config);
    const deploymentGenerator = new ExplorerDeploymentGenerator(this.context.config);

    // Build ConfigMaps
    manifests.push(configMapGenerator.configMap());

    // Build Service
    manifests.push(serviceGenerator.service());

    // Build Deployment
    manifests.push(deploymentGenerator.deployment());

    return manifests;
  }

  /**
   * Generate and write YAML files for the Explorer service
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
   * explorer/
   *   configmap.yaml: chain configurations
   *   service.yaml: explorer service
   *   deployment.yaml: explorer deployment
   */
  writeManifests(
    manifests: Array<ConfigMap | Service | Deployment>,
    outputDir: string
  ): void {
    const explorerDir = path.join(outputDir, 'explorer');

    // Create explorer directory
    fs.mkdirSync(explorerDir, { recursive: true });

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
      fs.writeFileSync(path.join(explorerDir, 'configmap.yaml'), configMapYaml);
    }

    // Write Services
    if (services.length > 0) {
      const serviceYaml = services.map((svc) => yaml.dump(svc)).join('---\n');
      fs.writeFileSync(path.join(explorerDir, 'service.yaml'), serviceYaml);
    }

    // Write Deployments
    if (deployments.length > 0) {
      const deploymentYaml = deployments
        .map((d) => yaml.dump(d))
        .join('---\n');
      fs.writeFileSync(path.join(explorerDir, 'deployment.yaml'), deploymentYaml);
    }
  }
}
