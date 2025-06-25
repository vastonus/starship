import { DefaultsManager } from '../defaults';
import { GeneratorContext } from '../types';

export interface IBuilder {
  generateFiles(outputDir?: string): Promise<void>;
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
