import { Relayer, StarshipConfig } from '@starship-ci/types';
import { ConfigMap, Service, StatefulSet } from 'kubernetesjs';

import { DefaultsManager } from '../../defaults';
import { IRelayerBuilder } from './base';
import { GoRelayerBuilder } from './go-relayer';
import { HermesRelayerBuilder } from './hermes';
import { NeutronQueryRelayerBuilder } from './neutron-query';
import { TsRelayerBuilder } from './ts-relayer';

// Export all individual builders and components
export * from './base';
export * from './go-relayer';
export * from './hermes';
export * from './neutron-query';
export * from './ts-relayer';

/**
 * Factory for creating appropriate relayer builders based on relayer type
 */
export class RelayerBuilderFactory {
  static createBuilder(
    config: StarshipConfig,
    relayer: Relayer
  ): IRelayerBuilder {
    switch (relayer.type) {
      case 'hermes':
        return new HermesRelayerBuilder(config, relayer);
      case 'go-relayer':
        return new GoRelayerBuilder(config, relayer);
      case 'ts-relayer':
        return new TsRelayerBuilder(config, relayer);
      case 'neutron-query-relayer':
        return new NeutronQueryRelayerBuilder(config, relayer);
      default:
        throw new Error(`Unsupported relayer type: ${relayer.type}`);
    }
  }
}

/**
 * Main RelayerBuilder that uses the factory pattern to create appropriate builders
 */
export class RelayerBuilder {
  private config: StarshipConfig;
  private relayers: Relayer[];
  private defaultsManager: DefaultsManager;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.defaultsManager = new DefaultsManager();

    // Process relayers with defaults
    this.relayers = (config.relayers || []).map((relayer) =>
      this.defaultsManager.processRelayer(relayer)
    );
  }

  /**
   * Build all relayer manifests
   */
  buildManifests(): (ConfigMap | Service | StatefulSet)[] {
    const manifests: (ConfigMap | Service | StatefulSet)[] = [];

    this.relayers.forEach((relayer) => {
      try {
        const builder = RelayerBuilderFactory.createBuilder(
          this.config,
          relayer
        );
        const relayerManifests = builder.buildManifests();
        manifests.push(...relayerManifests);
      } catch (error) {
        console.error(
          `Error building manifests for relayer ${relayer.name}:`,
          error
        );
        throw error;
      }
    });

    return manifests;
  }

  /**
   * Get all relayer configurations
   */
  getRelayers(): Relayer[] {
    return this.relayers;
  }

  /**
   * Get relayers by type
   */
  getRelayersByType(type: string): Relayer[] {
    return this.relayers.filter((relayer) => relayer.type === type);
  }

  /**
   * Check if there are any relayers configured
   */
  hasRelayers(): boolean {
    return this.relayers.length > 0;
  }

  /**
   * Get supported relayer types
   */
  static getSupportedTypes(): string[] {
    return ['hermes', 'go-relayer', 'ts-relayer', 'neutron-query-relayer'];
  }
}
