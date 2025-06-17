import { StarshipConfig } from '@starship-ci/types';
import * as path from 'path';

import { GeneratorContext } from '../types';
import { CosmosBuilder } from './cosmos';
import { ExplorerBuilder } from './explorer';
import { FrontendBuilder } from './frontend';
import { RegistryBuilder } from './registry';

export class BuilderManager {
  private context: GeneratorContext;
  private outputDir: string;

  constructor(context: GeneratorContext, outputDir: string) {
    this.context = context;
    this.outputDir = outputDir;
  }

  async buildAll(): Promise<void> {
    // Build registry if enabled
    if (this.context.config.registry?.enabled) {
      const registryBuilder = new RegistryBuilder(this.context, this.outputDir);
      await registryBuilder.generateFiles();
    }

    // Build explorer if enabled
    if (this.context.config.explorer?.enabled) {
      const explorerBuilder = new ExplorerBuilder(this.context, this.outputDir);
      await explorerBuilder.generateFiles();
    }

    // Build frontends if any
    if (this.context.config.frontends?.length) {
      const frontendBuilder = new FrontendBuilder(this.context, this.outputDir);
      await frontendBuilder.generateFiles();
    }

    // Build cosmos chains
    if (this.context.config.chains?.length) {
      const cosmosBuilder = new CosmosBuilder(this.context, this.outputDir);
      await cosmosBuilder.generateFiles();
    }
  }

  async buildRegistry(): Promise<void> {
    if (!this.context.config.registry?.enabled) {
      return;
    }
    const registryBuilder = new RegistryBuilder(this.context, this.outputDir);
    await registryBuilder.generateFiles();
  }

  async buildExplorer(): Promise<void> {
    if (!this.context.config.explorer?.enabled) {
      return;
    }
    const explorerBuilder = new ExplorerBuilder(this.context, this.outputDir);
    await explorerBuilder.generateFiles();
  }

  async buildFrontends(): Promise<void> {
    if (!this.context.config.frontends?.length) {
      return;
    }
    const frontendBuilder = new FrontendBuilder(this.context, this.outputDir);
    await frontendBuilder.generateFiles();
  }

  async buildCosmos(): Promise<void> {
    if (!this.context.config.chains?.length) {
      return;
    }
    const cosmosBuilder = new CosmosBuilder(this.context, this.outputDir);
    await cosmosBuilder.generateFiles();
  }
} 