import { StarshipConfig } from '@starship-ci/types';

import { GeneratorConfig, IGenerator, Manifest } from '../../../types';
import { EthereumConfigMapGenerator } from './configmap';
import { EthereumServiceGenerator } from './service';
import { EthereumStatefulSetGenerator } from './statefulset';

/**
 * Main Ethereum builder
 * Orchestrates ConfigMap, Service, and StatefulSet generation for all Ethereum chains
 */
export class EthereumBuilder implements IGenerator {
  private config: GeneratorConfig;
  private generators: IGenerator[];

  constructor(config: GeneratorConfig) {
    this.config = config;
    this.generators = [];

    // Filter ethereum chains
    const ethereumChains =
      this.config.chains?.filter(
        (chain) =>
          chain.name === 'ethereum' || chain.name.startsWith('ethereum-')
      ) || [];

    if (ethereumChains.length === 0) {
      return; // No ethereum chains to process
    }

    // Per-chain generators
    ethereumChains.forEach((chain) => {
      // ConfigMaps
      this.generators.push(new EthereumConfigMapGenerator(chain, this.config));

      // Services
      this.generators.push(new EthereumServiceGenerator(chain, this.config));

      // StatefulSets
      this.generators.push(
        new EthereumStatefulSetGenerator(chain, this.config)
      );
    });
  }

  generate(): Manifest[] {
    return this.generators.flatMap((generator) => generator.generate());
  }
}
