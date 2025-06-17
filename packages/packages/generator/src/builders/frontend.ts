import { StarshipConfig, Frontend } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Service, Deployment } from 'kubernetesjs';
import * as path from 'path';

import { DefaultsManager } from '../defaults';
import { TemplateHelpers } from '../helpers';
import { GeneratorContext } from '../types';
import { BaseBuilder, BaseConfig, BaseDeploymentGenerator, BaseServiceGenerator } from './base';

interface FrontendConfig extends BaseConfig {
  type: 'frontend';
}

class FrontendServiceGenerator extends BaseServiceGenerator<FrontendConfig> {
  service(): Service {
    const ports = [];
    if (this.serviceConfig.ports?.rest) {
      ports.push({
        name: 'http',
        port: this.serviceConfig.ports.rest,
        protocol: 'TCP' as const,
        targetPort: 'http'
      });
    }

    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: this.serviceConfig.name,
        labels: this.labels()
      },
      spec: {
        clusterIP: 'None',
        ports,
        selector: {
          'app.kubernetes.io/name': this.serviceConfig.name
        }
      }
    };
  }
}

class FrontendDeploymentGenerator extends BaseDeploymentGenerator<FrontendConfig> {
  deployment(): Deployment {
    const ports = [];
    if (this.serviceConfig.ports?.rest) {
      ports.push({
        name: 'http',
        containerPort: this.serviceConfig.ports.rest,
        protocol: 'TCP'
      });
    }

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: this.serviceConfig.name,
        labels: this.labels()
      },
      spec: {
        replicas: this.serviceConfig.replicas || 1,
        revisionHistoryLimit: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/instance': this.serviceConfig.name,
            'app.kubernetes.io/name': this.serviceConfig.name
          }
        },
        template: {
          metadata: {
            annotations: this.commonAnnotations(),
            labels: this.commonLabels()
          },
          spec: {
            ...(this.serviceConfig.imagePullSecrets
              ? TemplateHelpers.generateImagePullSecrets(
                  this.serviceConfig.imagePullSecrets.map((name) => ({ name }))
                )
              : {}),
            containers: [
              {
                name: this.serviceConfig.name,
                image: this.serviceConfig.image,
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
                  ...(this.serviceConfig.env
                    ? Object.entries(this.serviceConfig.env).map(([name, value]) => ({
                        name,
                        value: String(value)
                      }))
                    : [])
                ],
                ...(ports.length > 0 && { ports }),
                resources: TemplateHelpers.getResourceObject(
                  this.serviceConfig.resources || { cpu: '0.1', memory: '128M' }
                ),
                ...this.commonProbes('http')
              }
            ]
          }
        }
      }
    };
  }
}

export class FrontendBuilder extends BaseBuilder<FrontendConfig> {
  protected buildManifests(frontend: FrontendConfig): Array<Service | Deployment> {
    const manifests: Array<Service | Deployment> = [];
    const serviceGenerator = new FrontendServiceGenerator(frontend, this.context.config);
    const deploymentGenerator = new FrontendDeploymentGenerator(frontend, this.context.config);
    manifests.push(serviceGenerator.service());
    manifests.push(deploymentGenerator.deployment());
    return manifests;
  }

  async generateFiles(outputDir?: string): Promise<void> {
    const targetDir = outputDir || this.outputDir;
    if (!targetDir) {
      throw new Error('Output directory must be provided either in constructor or method call');
    }

    if (!this.context.config.frontends?.length) {
      return;
    }

    for (const frontend of this.context.config.frontends) {
      const config: FrontendConfig = {
        ...frontend,
        type: 'frontend',
        resources: {
          cpu: String(frontend.resources?.cpu || '0.1'),
          memory: String(frontend.resources?.memory || '128M')
        }
      };
      const manifests = this.buildManifests(config);
      this.writeManifests(config, manifests, targetDir);
    }
  }

  writeManifests(frontend: FrontendConfig, manifests: Array<Service | Deployment>, outputDir: string): void {
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
