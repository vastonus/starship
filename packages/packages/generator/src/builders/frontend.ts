import { Frontend, StarshipConfig } from '@starship-ci/types';
import { Deployment, Service } from 'kubernetesjs';

import * as helpers from '../helpers';
import { IGenerator, Manifest } from '../types';

/**
 * Service generator for Frontend services
 */
export class FrontendServiceGenerator implements IGenerator {
  private config: StarshipConfig;
  private frontend: Frontend;

  constructor(frontend: Frontend, config: StarshipConfig) {
    this.config = config;
    this.frontend = frontend;
  }

  generate(): Array<Service> {
    return [
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: this.frontend.name,
          labels: {
            'app.kubernetes.io/name': this.frontend.name,
            'app.kubernetes.io/component': 'frontend',
            'app.kubernetes.io/part-of': 'starship',
            ...helpers.getCommonLabels(this.config)
          }
        },
        spec: {
          clusterIP: 'None',
          ports: this.frontend.ports?.rest
            ? [
                {
                  name: 'http',
                  port: this.frontend.ports.rest,
                  protocol: 'TCP',
                  targetPort: 'http'
                }
              ]
            : [],
          selector: {
            'app.kubernetes.io/name': this.frontend.name
          }
        }
      }
    ];
  }
}

/**
 * Deployment generator for Frontend services
 */
export class FrontendDeploymentGenerator implements IGenerator {
  private config: StarshipConfig;
  private frontend: Frontend;

  constructor(frontend: Frontend, config: StarshipConfig) {
    this.config = config;
    this.frontend = frontend;
  }

  generate(): Array<Deployment> {
    return [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: this.frontend.name,
          labels: {
            'app.kubernetes.io/component': 'frontend',
            'app.kubernetes.io/part-of': 'starship',
            'app.kubernetes.io/name': this.frontend.name,
            ...helpers.getCommonLabels(this.config)
          }
        },
        spec: {
          replicas: this.frontend.replicas || 1,
          revisionHistoryLimit: 3,
          selector: {
            matchLabels: {
              'app.kubernetes.io/instance': this.frontend.name,
              'app.kubernetes.io/name': this.frontend.name
            }
          },
          template: {
            metadata: {
              annotations: {
                quality: 'release',
                role: 'frontend',
                sla: 'high',
                tier: 'frontend'
              },
              labels: {
                ...helpers.getCommonLabels(this.config),
                'app.kubernetes.io/instance': this.frontend.name,
                'app.kubernetes.io/type': this.frontend.type,
                'app.kubernetes.io/name': this.frontend.name
              }
            },
            spec: {
              containers: [
                {
                  name: this.frontend.name,
                  image: this.frontend.image,
                  imagePullPolicy:
                    this.config.images?.imagePullPolicy || 'IfNotPresent',
                  ports: this.frontend.ports?.rest
                    ? [
                        {
                          name: 'http',
                          containerPort: this.frontend.ports.rest,
                          protocol: 'TCP'
                        }
                      ]
                    : [],
                  env: this.frontend.env || [],
                  resources: helpers.getResourceObject(
                    this.frontend.resources || { cpu: '0.2', memory: '200M' }
                  )
                }
              ]
            }
          }
        }
      }
    ];
  }
}

/**
 * Main Frontend builder
 */
export class FrontendBuilder implements IGenerator {
  private config: StarshipConfig;
  private generators: Array<IGenerator>;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.generators = [];

    if (config.frontends && config.frontends.length > 0) {
      config.frontends.forEach((frontend) => {
        this.generators.push(new FrontendServiceGenerator(frontend, config));
        this.generators.push(new FrontendDeploymentGenerator(frontend, config));
      });
    }
  }

  generate(): Array<Manifest> {
    return this.generators.flatMap((generator) => generator.generate());
  }
}
