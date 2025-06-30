import { StarshipConfig } from '@starship-ci/types';
import { Ingress, IngressRule, IngressTLS } from 'kubernetesjs';

import * as helpers from '../helpers';
import { IGenerator, Manifest } from '../types';

/**
 * Cert Issuer generator for Ingress
 * Based on the Helm template: ingress/cert-issuer.yaml
 */
export class IngressCertIssuerGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<any> {
    if (!this.config.ingress?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Issuer',
        metadata: {
          name: this.config.ingress.certManager?.issuer || 'cert-issuer',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'ingress',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        spec: {
          acme: {
            server: 'https://acme-v02.api.letsencrypt.org/directory',
            email: 'devops@cosmoslogy.zone',
            privateKeySecretRef: {
              name: this.config.ingress.certManager?.issuer || 'cert-issuer'
            },
            solvers: [
              {
                http01: {
                  ingress: {
                    class: this.config.ingress.type
                  }
                }
              }
            ]
          }
        }
      }
    ];
  }
}

/**
 * Ingress resource generator
 * Based on the Helm template: ingress/ingress.yaml
 */
export class IngressResourceGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Ingress> {
    if (!this.config.ingress?.enabled) {
      return [];
    }

    const host = this.config.ingress.host?.replace('*.', '') || 'thestarship.io';
    const ingressType = this.config.ingress.type;
    const issuer = this.config.ingress.certManager?.issuer || 'cert-issuer';

    return [
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: `${ingressType}-ingress`,
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'ingress',
            'app.kubernetes.io/part-of': 'starship'
          },
          annotations: {
            'nginx.ingress.kubernetes.io/rewrite-target': '/$1',
            'nginx.ingress.kubernetes.io/use-regex': 'true',
            'cert-manager.io/issuer': issuer
          }
        },
        spec: {
          ingressClassName: ingressType,
          tls: this.generateTlsConfig(host, ingressType),
          rules: this.generateIngressRules(host)
        }
      }
    ];
  }

  private generateTlsConfig(host: string, ingressType: string): Array<IngressTLS> {
    const tls: Array<IngressTLS> = [];

    // Explorer TLS
    if (this.config.explorer?.enabled) {
      tls.push({
        hosts: [`explorer.${host}`],
        secretName: `explorer.${ingressType}-ingress-tls`
      });
    }

    // Registry TLS
    if (this.config.registry?.enabled) {
      tls.push({
        hosts: [`registry.${host}`],
        secretName: `registry.${ingressType}-ingress-tls`
      });
    }

    // Chains TLS
    this.config.chains?.forEach((chain) => {
      tls.push({
        hosts: [`rest.${chain.id}-genesis.${host}`],
        secretName: `rest.${chain.id}-genesis.${ingressType}-ingress-tls`
      });
      tls.push({
        hosts: [`rpc.${chain.id}-genesis.${host}`],
        secretName: `rpc.${chain.id}-genesis.${ingressType}-ingress-tls`
      });
    });

    // Frontends TLS
    this.config.frontends?.forEach((frontend) => {
      tls.push({
        hosts: [`${frontend.name}.${host}`],
        secretName: `${frontend.name}.${ingressType}-ingress-tls`
      });
    });

    return tls;
  }

  private generateIngressRules(host: string): Array<IngressRule> {
    const rules: Array<IngressRule> = [];

    // Explorer rules
    if (this.config.explorer?.enabled) {
      rules.push({
        host: `explorer.${host}`,
        http: {
          paths: [
            {
              pathType: 'ImplementationSpecific',
              path: '/(.*)',
              backend: {
                service: {
                  name: 'explorer',
                  port: {
                    name: 'http'
                  }
                }
              }
            }
          ]
        }
      });
    }

    // Registry rules
    if (this.config.registry?.enabled) {
      rules.push({
        host: `registry.${host}`,
        http: {
          paths: [
            {
              pathType: 'ImplementationSpecific',
              path: '/(.*)',
              backend: {
                service: {
                  name: 'registry',
                  port: {
                    name: 'http'
                  }
                }
              }
            }
          ]
        }
      });
    }

    // Chain rules
    this.config.chains?.forEach((chain) => {
      // REST endpoint
      rules.push({
        host: `rest.${chain.id}-genesis.${host}`,
        http: {
          paths: [
            {
              pathType: 'ImplementationSpecific',
              path: '/(.*)',
              backend: {
                service: {
                  name: `${chain.id}-genesis`,
                  port: {
                    name: 'rest'
                  }
                }
              }
            },
            {
              pathType: 'ImplementationSpecific',
              path: '/faucet/(.*)',
              backend: {
                service: {
                  name: `${chain.id}-genesis`,
                  port: {
                    name: 'faucet'
                  }
                }
              }
            },
            {
              pathType: 'ImplementationSpecific',
              path: '/exposer/(.*)',
              backend: {
                service: {
                  name: `${chain.id}-genesis`,
                  port: {
                    name: 'exposer'
                  }
                }
              }
            }
          ]
        }
      });

      // RPC endpoint
      rules.push({
        host: `rpc.${chain.id}-genesis.${host}`,
        http: {
          paths: [
            {
              pathType: 'ImplementationSpecific',
              path: '/(.*)',
              backend: {
                service: {
                  name: `${chain.id}-genesis`,
                  port: {
                    name: 'rpc'
                  }
                }
              }
            }
          ]
        }
      });
    });

    // Relayer rules (only for hermes)
    this.config.relayers?.forEach((relayer) => {
      if (relayer.type === 'hermes') {
        rules.push({
          host: `rest.${relayer.type}-${relayer.name}.${host}`,
          http: {
            paths: [
              {
                pathType: 'ImplementationSpecific',
                path: '/(.*)',
                backend: {
                  service: {
                    name: `${relayer.type}-${relayer.name}`,
                    port: {
                      name: 'rest'
                    }
                  }
                }
              },
              {
                pathType: 'ImplementationSpecific',
                path: '/exposer/(.*)',
                backend: {
                  service: {
                    name: `${relayer.type}-${relayer.name}`,
                    port: {
                      name: 'exposer'
                    }
                  }
                }
              }
            ]
          }
        });
      }
    });

    // Frontend rules
    this.config.frontends?.forEach((frontend) => {
      rules.push({
        host: `${frontend.name}.${host}`,
        http: {
          paths: [
            {
              pathType: 'ImplementationSpecific',
              path: '/(.*)',
              backend: {
                service: {
                  name: frontend.name,
                  port: {
                    name: 'http'
                  }
                }
              }
            }
          ]
        }
      });
    });

    return rules;
  }
}

/**
 * Main Ingress builder
 * Orchestrates cert-issuer and ingress resource generation
 */
export class IngressBuilder implements IGenerator {
  private config: StarshipConfig;
  private generators: Array<IGenerator>;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.generators = [];

    if (this.config.ingress?.enabled) {
      this.generators = [
        new IngressCertIssuerGenerator(config),
        new IngressResourceGenerator(config)
      ];
    }
  }

  generate(): Array<Manifest> {
    return this.generators.flatMap((generator) => generator.generate());
  }
} 