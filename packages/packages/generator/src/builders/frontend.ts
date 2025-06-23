import { StarshipConfig } from '@starship-ci/types';

import { TemplateHelpers } from '../helpers';

/**
 * Service generator for Frontend services
 */
export class FrontendServiceGenerator {
  private config: StarshipConfig;
  private frontend: any;

  constructor(config: StarshipConfig, frontend: any) {
    this.config = config;
    this.frontend = frontend;
  }

  service(): any {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: this.frontend.name,
        labels: {
          'app.kubernetes.io/name': this.frontend.name,
          'app.kubernetes.io/component': 'frontend',
          'app.kubernetes.io/part-of': 'starship',
          ...TemplateHelpers.commonLabels(this.config)
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
    };
  }
}

/**
 * Deployment generator for Frontend services
 */
export class FrontendDeploymentGenerator {
  private config: StarshipConfig;
  private frontend: any;

  constructor(config: StarshipConfig, frontend: any) {
    this.config = config;
    this.frontend = frontend;
  }

  deployment(): any {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: this.frontend.name,
        labels: {
          'app.kubernetes.io/component': 'frontend',
          'app.kubernetes.io/part-of': 'starship',
          ...TemplateHelpers.commonLabels(this.config)
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
              'app.kubernetes.io/instance': this.frontend.name,
              'app.kubernetes.io/type': this.frontend.type,
              'app.kubernetes.io/name': this.frontend.name,
              'app.kubernetes.io/rawname': this.frontend.name,
              'app.kubernetes.io/version': this.config.version || '1.8.0'
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
                resources: TemplateHelpers.getResourceObject(
                  this.frontend.resources || { cpu: '0.2', memory: '200M' }
                )
              }
            ]
          }
        }
      }
    };
  }
}

/**
 * Main Frontend builder
 */
export class FrontendBuilder {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  buildManifests(): any[] {
    const manifests: any[] = [];

    if (!this.config.frontends || this.config.frontends.length === 0) {
      return manifests;
    }

    this.config.frontends.forEach((frontend) => {
      const serviceGenerator = new FrontendServiceGenerator(
        this.config,
        frontend
      );
      const deploymentGenerator = new FrontendDeploymentGenerator(
        this.config,
        frontend
      );

      manifests.push(serviceGenerator.service());
      manifests.push(deploymentGenerator.deployment());
    });

    return manifests;
  }
}
