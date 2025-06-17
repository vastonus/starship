import { StarshipConfig, Frontend } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Service, Deployment } from 'kubernetesjs';
import * as path from 'path';

import { DefaultsManager } from '../defaults';
import { TemplateHelpers } from '../helpers';
import { GeneratorContext } from '../types';

/**
 * Service generator for Frontend services
 */
export class FrontendServiceGenerator {
  private config: StarshipConfig;
  private frontend: Frontend;

  constructor(frontend: Frontend, config: StarshipConfig) {
    this.config = config;
    this.frontend = frontend;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': this.frontend.name,
      'app.kubernetes.io/type': 'frontend-service'
    };
  }

  service(): Service {
    const ports = [];
    if (this.frontend.ports?.rest) {
      ports.push({
        name: 'http',
        port: this.frontend.ports.rest,
        protocol: 'TCP' as const,
        targetPort: 'http'
      });
    }

    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: this.frontend.name,
        labels: this.labels()
      },
      spec: {
        clusterIP: 'None',
        ports,
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
  private frontend: Frontend;

  constructor(frontend: Frontend, config: StarshipConfig) {
    this.config = config;
    this.frontend = frontend;
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/name': this.frontend.name,
      'app.kubernetes.io/type': 'frontend-deployment'
    };
  }

  deployment(): Deployment {
    const ports = [];
    if (this.frontend.ports?.rest) {
      ports.push({
        name: 'http',
        containerPort: this.frontend.ports.rest,
        protocol: 'TCP'
      });
    }

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: this.frontend.name,
        labels: this.labels()
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
                  ...(Array.isArray(this.frontend.env) 
                    ? this.frontend.env.map((env: any) => ({
                        name: env.name,
                        value: String(env.value)
                      }))
                    : [])
                ],
                ...(ports.length > 0 && { ports }),
                resources: TemplateHelpers.getResourceObject(
                  this.frontend.resources || { cpu: '0.1', memory: '128M' }
                ),
                readinessProbe: {
                  tcpSocket: {
                    port: 'http'
                  },
                  initialDelaySeconds: 20,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3
                },
                livenessProbe: {
                  tcpSocket: {
                    port: 'http'
                  },
                  initialDelaySeconds: 20,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3
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
 * Main Frontend builder
 */
export class FrontendBuilder {
  private defaultsManager: DefaultsManager;
  private context: GeneratorContext;
  private outputDir?: string;

  constructor(context: GeneratorContext, outputDir?: string) {
    this.context = context;
    this.outputDir = outputDir;
    this.defaultsManager = new DefaultsManager();
  }

  buildManifests(frontend: Frontend): Array<Service | Deployment> {
    const manifests: Array<Service | Deployment> = [];
    const serviceGenerator = new FrontendServiceGenerator(frontend, this.context.config);
    const deploymentGenerator = new FrontendDeploymentGenerator(frontend, this.context.config);
    manifests.push(serviceGenerator.service());
    manifests.push(deploymentGenerator.deployment());
    return manifests;
  }

  generateFiles(outputDir?: string): void {
    const targetDir = outputDir || this.outputDir;
    if (!targetDir) {
      throw new Error('Output directory must be provided either in constructor or method call');
    }

    if (!this.context.config.frontends?.length) {
      return;
    }

    for (const frontend of this.context.config.frontends) {
      const manifests = this.buildManifests(frontend);
      this.writeManifests(frontend, manifests, targetDir);
    }
  }

  writeManifests(frontend: Frontend, manifests: Array<Service | Deployment>, outputDir: string): void {
    const frontendDir = path.join(outputDir, 'frontends', frontend.name);
    fs.mkdirSync(frontendDir, { recursive: true });

    const services = manifests.filter((m) => m.kind === 'Service') as Service[];
    const deployments = manifests.filter((m) => m.kind === 'Deployment') as Deployment[];

    if (services.length > 0) {
      const serviceYaml = services.map((svc) => yaml.dump(svc)).join('---\n');
      fs.writeFileSync(path.join(frontendDir, 'service.yaml'), serviceYaml);
    }

    if (deployments.length > 0) {
      const deploymentYaml = deployments.map((d) => yaml.dump(d)).join('---\n');
      fs.writeFileSync(path.join(frontendDir, 'deployment.yaml'), deploymentYaml);
    }
  }
}
