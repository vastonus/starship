import { Service, Deployment, ConfigMap, StatefulSet } from 'kubernetesjs';

import { DefaultsManager } from '../defaults';
import { GeneratorContext } from '../types';

export interface IBuilder {
  generateFiles(outputDir?: string): Promise<void>;
}

export interface IServiceGenerator {
  service(): Service;
}

export interface IDeploymentGenerator {
  deployment(): Deployment;
}

export interface IManifestGenerator {
  buildManifests(): Array<Service | Deployment | ConfigMap | StatefulSet>;
}

export abstract class BaseBuilder implements IBuilder {
  protected defaultsManager: DefaultsManager;
  protected context: GeneratorContext;
  protected outputDir?: string;

  constructor(context: GeneratorContext, outputDir?: string) {
    this.context = context;
    this.outputDir = outputDir;
    this.defaultsManager = new DefaultsManager();
  }

  abstract generateFiles(outputDir?: string): Promise<void>;
} 