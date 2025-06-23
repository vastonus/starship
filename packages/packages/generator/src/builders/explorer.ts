import { StarshipConfig, Chain } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ConfigMap, Service, Deployment } from 'kubernetesjs';
import * as path from 'path';

import { TemplateHelpers } from '../helpers';

/**
 * ConfigMap generator for Explorer service
 * Handles chain configurations for the explorer
 */
export class ExplorerConfigMapGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  configMap(): any {
    const chainConfigs: Record<string, string> = {};

    this.config.chains.forEach((chain) => {
      const hostname = TemplateHelpers.chainName(String(chain.id));
      const host = this.config.explorer?.localhost
        ? 'localhost'
        : `${hostname}-genesis.$(NAMESPACE).svc.cluster.local`;

      chainConfigs[`${chain.id}.json`] = JSON.stringify({
        chain_name: chain.id,
        coingecko: chain.name,
        api: this.config.ingress?.enabled && this.config.ingress.host
          ? `https://rest.${chain.id}-genesis.${this.config.ingress.host.replace('*.', '')}:443`
          : `http://${host}:${chain.ports?.rest || 1317}`,
        rpc: [
          this.config.ingress?.enabled && this.config.ingress.host
            ? `https://rpc.${chain.id}-genesis.${this.config.ingress.host.replace('*.', '')}:443`
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
            symbol: chain.prefix?.toUpperCase(),
            exponent: '6',
            coingecko_id: chain.id,
            logo: ''
          }
        ]
      });
    });

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'explorer',
        labels: TemplateHelpers.commonLabels(this.config)
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

  service(): any {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'explorer',
        labels: TemplateHelpers.commonLabels(this.config)
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

  deployment(): any {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'explorer',
        labels: TemplateHelpers.commonLabels(this.config)
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
                image: this.config.explorer?.image || 'ghcr.io/cosmology-tech/starship/ping-pub:latest',
                imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
                command: [
                  'bash',
                  '-c',
                  'yarn serve --host 0.0.0.0 --port 8080'
                ],
                resources: TemplateHelpers.getResourceObject(
                  this.config.explorer?.resources || {
                    cpu: '0.1',
                    memory: '128M'
                  }
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
  private config: StarshipConfig;
  private configMapGenerator: ExplorerConfigMapGenerator;
  private serviceGenerator: ExplorerServiceGenerator;
  private deploymentGenerator: ExplorerDeploymentGenerator;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.configMapGenerator = new ExplorerConfigMapGenerator(config);
    this.serviceGenerator = new ExplorerServiceGenerator(config);
    this.deploymentGenerator = new ExplorerDeploymentGenerator(config);
  }

  /**
   * Build all Kubernetes manifests for the Explorer service
   */
  buildManifests(): any[] {
    return [
      this.configMapGenerator.configMap(),
      this.serviceGenerator.service(),
      this.deploymentGenerator.deployment()
    ];
  }
}
