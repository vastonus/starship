import { Relayer, StarshipConfig } from '@starship-ci/types';
import { ConfigMap, Service, StatefulSet } from 'kubernetesjs';

import { DefaultsManager } from '../../defaults';
import { GoRelayerBuilder } from './go-relayer';
import { HermesRelayerBuilder } from './hermes';
import { NeutronQueryRelayerBuilder } from './neutron-query';
import { TsRelayerBuilder } from './ts-relayer';
import { IGenerator, Manifest } from '../../types';

// Export all individual builders and components
export * from './base';
export * from './go-relayer';
export * from './hermes';
export * from './neutron-query';
export * from './ts-relayer';

const relayerBuilderRegistry: Record<string, new (relayer: Relayer, config: StarshipConfig) => IGenerator> = {
  hermes: HermesRelayerBuilder,
  'go-relayer': GoRelayerBuilder,
  'ts-relayer': TsRelayerBuilder,
  'neutron-query-relayer': NeutronQueryRelayerBuilder,
};

function createBuilder(relayer: Relayer, config: StarshipConfig): IGenerator {
  const builder = relayerBuilderRegistry[relayer.type];
  if (!builder) {
    throw new Error(`Unsupported relayer type: ${relayer.type}`);
  }
  return new builder(relayer, config);
}

/**
 * Main RelayerBuilder that uses the factory pattern to create appropriate builders
 */
export class RelayerBuilder implements IGenerator {
  private config: StarshipConfig;
  private relayers: Relayer[];
  private defaultsManager: DefaultsManager;
  private generators: IGenerator[] = [];

  constructor(config: StarshipConfig) {
    this.config = config;
    this.defaultsManager = new DefaultsManager();

    // Process relayers with defaults
    this.relayers = (config.relayers || []).map((relayer) =>
      this.defaultsManager.processRelayer(relayer)
    );

    this.generators = this.relayers.map((relayer) =>
      createBuilder(relayer, this.config)
    );
  }

  generate(): Manifest[] {
    return this.generators.flatMap((generator) => generator.generate());
  }

  getSupportedTypes(): string[] {
    return Object.keys(relayerBuilderRegistry);
  }
}
