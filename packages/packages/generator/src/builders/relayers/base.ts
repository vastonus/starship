import { Relayer, StarshipConfig } from '@starship-ci/types';
import { ConfigMap, Service, StatefulSet } from 'kubernetesjs';

import { TemplateHelpers } from '../../helpers';

/**
 * Interface for relayer builders
 */
export interface IRelayerBuilder {
  buildManifests(): (ConfigMap | Service | StatefulSet)[];
}

/**
 * Interface for relayer generators
 */
export interface IRelayerConfigMapGenerator {
  configMap(): ConfigMap;
}

export interface IRelayerServiceGenerator {
  service(): Service;
}

export interface IRelayerStatefulSetGenerator {
  statefulSet(): StatefulSet;
}

/**
 * Base class for relayer builders with common functionality
 */
export abstract class BaseRelayerBuilder implements IRelayerBuilder {
  protected config: StarshipConfig;
  protected relayer: Relayer;

  constructor(config: StarshipConfig, relayer: Relayer) {
    this.config = config;
    this.relayer = relayer;
  }

  /**
   * Generate common metadata for relayer resources
   */
  protected getCommonMetadata(resourceType: string): any {
    return {
      name: `${this.relayer.type}-${this.relayer.name}`,
      labels: {
        ...TemplateHelpers.commonLabels(this.config),
        'app.kubernetes.io/component': 'relayer',
        'app.kubernetes.io/part-of': 'starship',
        'app.kubernetes.io/role': this.relayer.type,
        'app.kubernetes.io/name': `${this.relayer.type}-${this.relayer.name}`
      }
    };
  }

  /**
   * Get chain configuration by ID
   */
  protected getChainConfig(chainId: string) {
    const chain = this.config.chains.find(c => String(c.id) === chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found in configuration`);
    }
    return chain;
  }

  /**
   * Get chain hostname
   */
  protected getChainHostname(chainId: string): string {
    const chain = this.getChainConfig(chainId);
    return TemplateHelpers.chainName(String(chain.id));
  }

  /**
   * Get default image for relayer type
   */
  protected getDefaultImage(): string {
    switch (this.relayer.type) {
      case 'hermes':
        return 'ghcr.io/cosmology-tech/starship/hermes:1.10.0';
      case 'go-relayer':
        return 'ghcr.io/cosmology-tech/starship/go-relayer:v2.4.1';
      case 'ts-relayer':
        return 'ghcr.io/cosmology-tech/starship/ts-relayer:0.9.0';
      case 'neutron-query-relayer':
        return 'ghcr.io/cosmology-tech/starship/neutron-query-relayer:v0.2.0';
      default:
        throw new Error(`Unknown relayer type: ${this.relayer.type}`);
    }
  }

  /**
   * Get image for relayer (custom or default)
   */
  protected getImage(): string {
    return this.relayer.image || this.getDefaultImage();
  }

  /**
   * Generate common volumes for relayers
   */
  protected generateVolumes(): any[] {
    return [
      { name: 'relayer', emptyDir: {} },
      { name: 'relayer-config', configMap: { name: `${this.relayer.type}-${this.relayer.name}` } },
      { name: 'keys', configMap: { name: 'keys' } },
      { name: 'scripts', configMap: { name: 'setup-scripts' } }
    ];
  }

  /**
   * Generate common environment variables
   */
  protected generateCommonEnv(): any[] {
    return [
      { name: 'KEYS_CONFIG', value: '/keys/keys.json' },
      { name: 'NAMESPACE', valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } } }
    ];
  }

  /**
   * Generate wait init containers for all chains
   */
  protected generateWaitInitContainers(): any[] {
    return this.relayer.chains.map((chainId) => {
      const chain = this.getChainConfig(chainId);
      const chainName = TemplateHelpers.chainName(String(chain.id));
      
      return {
        name: `init-${chainName}`,
        image: 'ghcr.io/cosmology-tech/starship/wait-for-service:v0.1.0',
        imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
        command: ['bash', '-c'],
        args: [
          `echo "Waiting for ${chainName} service..."\nwait-for-service ${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657`
        ],
        env: [
          {
            name: 'NAMESPACE',
            valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } }
          }
        ]
      };
    });
  }

  /**
   * Generate common volume mounts
   */
  protected generateCommonVolumeMounts(): any[] {
    return [
      { mountPath: '/root', name: 'relayer' },
      { mountPath: '/configs', name: 'relayer-config' },
      { mountPath: '/keys', name: 'keys' },
      { mountPath: '/scripts', name: 'scripts' }
    ];
  }

  abstract buildManifests(): (ConfigMap | Service | StatefulSet)[];
}

/**
 * Shared utilities for relayer configuration
 */
export class RelayerHelpers {
  /**
   * Get address type configuration for chain
   */
  static getAddressType(chainName: string): string {
    if (chainName === 'evmos') {
      return "address_type = { derivation = 'ethermint', proto_type = { pk_type = '/ethermint.crypto.v1.ethsecp256k1.PubKey' } }";
    } else if (chainName === 'injective') {
      return "address_type = { derivation = 'ethermint', proto_type = { pk_type = '/injective.crypto.v1beta1.ethsecp256k1.PubKey' } }";
    } else {
      return "address_type = { derivation = 'cosmos' }";
    }
  }

  /**
   * Get gas price configuration for chain
   */
  static getGasPrice(chainName: string, denom?: string): string {
    if (chainName === 'evmos' || chainName === 'injective') {
      return `gas_price = { price = 2500000, denom = "${denom}" }`;
    } else {
      return `gas_price = { price = 1.25, denom = "${denom}" }`;
    }
  }

  /**
   * Check if relayer type needs a service
   */
  static needsService(relayerType: string): boolean {
    return relayerType === 'hermes' || relayerType === 'neutron-query-relayer';
  }
} 