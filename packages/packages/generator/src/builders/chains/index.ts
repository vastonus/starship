import { GeneratorConfig, IGenerator, Manifest } from '../../types';
import { CosmosBuilder } from './cosmos';
import { EthereumBuilder } from './ethereum';

const chainBuilderRegistry: Record<
  string,
  new (config: GeneratorConfig) => IGenerator
> = {
  ethereum: EthereumBuilder
};

function createBuilder(chainName: string, config: GeneratorConfig): IGenerator {
  const builder = chainBuilderRegistry[chainName] || CosmosBuilder;
  return new builder(config);
}

/**
 * Main ChainBuilder that uses the factory pattern to create appropriate builders
 */
export class ChainBuilder implements IGenerator {
  private config: GeneratorConfig;
  private generators: IGenerator[] = [];

  constructor(config: GeneratorConfig) {
    this.config = config;

    // Create builders for each chain
    this.config.chains?.forEach((chain) => {
      this.generators.push(createBuilder(chain.name, this.config));
    });
  }

  generate(): Manifest[] {
    return this.generators.flatMap((generator) => generator.generate());
  }
}
