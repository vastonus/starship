import { StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { GeneratorContext } from '../types';
import { CosmosBuilder } from './cosmos';
import { ExplorerBuilder } from './explorer';
import { FrontendBuilder } from './frontend';
import { RegistryBuilder } from './registry';
import { DefaultsManager } from '../defaults';

export class BuilderManager {
  private config: StarshipConfig;
  private defaultsManager: DefaultsManager;

  constructor(config: StarshipConfig) {
    this.defaultsManager = new DefaultsManager();
    this.config = this.defaultsManager.apply(config);
  }

  private writeManifests(manifests: any[], outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    manifests.forEach(manifest => {
      const filename = `${manifest.metadata.name}-${manifest.kind.toLowerCase()}.yaml`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, yaml.dump(manifest));
    });
  }

  build(outputDir: string): void {
    const builders = [
      new CosmosBuilder(this.config),
      new RegistryBuilder(this.config),
      new ExplorerBuilder(this.config),
      new FrontendBuilder(this.config)
    ];

    let allManifests: any[] = [];

    builders.forEach(builder => {
      // @ts-ignore
      if (builder.buildManifests) {
        // @ts-ignore
        const manifests = builder.buildManifests();
        allManifests = allManifests.concat(manifests);
      }
    });
    
    this.writeManifests(allManifests, outputDir);
  }

  async buildAll(): Promise<void> {
    // Build registry if enabled
    if (this.config.registry?.enabled) {
      const registryBuilder = new RegistryBuilder(this.config);
      await registryBuilder.generateFiles();
    }

    // Build explorer if enabled
    if (this.config.explorer?.enabled) {
      const explorerBuilder = new ExplorerBuilder(this.config);
      await explorerBuilder.generateFiles();
    }

    // Build frontends if any
    if (this.config.frontends?.length) {
      const frontendBuilder = new FrontendBuilder(this.config);
      await frontendBuilder.generateFiles();
    }

    // Build cosmos chains
    if (this.config.chains?.length) {
      const cosmosBuilder = new CosmosBuilder(this.config);
      await cosmosBuilder.generateFiles();
    }
  }

  async buildRegistry(): Promise<void> {
    if (!this.config.registry?.enabled) {
      return;
    }
    const registryBuilder = new RegistryBuilder(this.config);
    await registryBuilder.generateFiles();
  }

  async buildExplorer(): Promise<void> {
    if (!this.config.explorer?.enabled) {
      return;
    }
    const explorerBuilder = new ExplorerBuilder(this.config);
    await explorerBuilder.generateFiles();
  }

  async buildFrontends(): Promise<void> {
    if (!this.config.frontends?.length) {
      return;
    }
    const frontendBuilder = new FrontendBuilder(this.config);
    await frontendBuilder.generateFiles();
  }

  async buildCosmos(): Promise<void> {
    if (!this.config.chains?.length) {
      return;
    }
    const cosmosBuilder = new CosmosBuilder(this.config);
    await cosmosBuilder.generateFiles();
  }
} 