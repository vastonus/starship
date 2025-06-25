import { Relayer, StarshipConfig } from '@starship-ci/types';
import { Container, EnvVar, Volume, VolumeMount } from 'kubernetesjs';

import { TemplateHelpers } from '../../helpers';
import { IGenerator, Manifest } from '../../types';

/**
 * Base class for relayer builders with common functionality
 */
export class BaseRelayerBuilder implements IGenerator {
  protected config: StarshipConfig;
  protected relayer: Relayer;
  protected generators: IGenerator[] = [];

  constructor(relayer: Relayer, config: StarshipConfig) {
    this.config = config;
    this.relayer = relayer;
  }

  /**
   * Generate all manifests for the relayer by running sub-generators
   */
  public generate(): Manifest[] {
    return this.generators.flatMap((generator) => generator.generate());
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
        'app.kubernetes.io/name': `${this.relayer.type}-${this.relayer.name}`,
      },
    };
  }

  /**
   * Get chain configuration by ID
   */
  protected getChainConfig(chainId: string) {
    const chain = this.config.chains.find((c) => String(c.id) === chainId);
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
   * Get image for relayer (custom or default)
   */
  protected getImage(): string {
    if (!this.relayer.image) {
      throw new Error(
        `No image configured for relayer ${this.relayer.name} of type ${this.relayer.type}`
      );
    }
    return this.relayer.image;
  }

  /**
   * Generate common volumes for relayers
   */
  protected generateVolumes(): Volume[] {
    return [
      { name: 'relayer', emptyDir: {} },
      {
        name: 'relayer-config',
        configMap: { name: `${this.relayer.type}-${this.relayer.name}` },
      },
      { name: 'keys', configMap: { name: 'keys' } },
      { name: 'scripts', configMap: { name: 'setup-scripts' } },
    ];
  }

  /**
   * Generate common environment variables
   */
  protected generateCommonEnv(): EnvVar[] {
    return [
      { name: 'KEYS_CONFIG', value: '/keys/keys.json' },
      {
        name: 'NAMESPACE',
        valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } },
      },
    ];
  }

  /**
   * Generate wait init containers for all chains
   */
  protected generateWaitInitContainers(): Container[] {
    return this.relayer.chains.map((chainId) => {
      const chain = this.getChainConfig(chainId);
      const chainName = TemplateHelpers.chainName(String(chain.id));

      return {
        name: `init-${chainName}`,
        image: 'ghcr.io/cosmology-tech/starship/wait-for-service:v0.1.0',
        imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
        command: ['bash', '-c'],
        args: [
          `echo "Waiting for ${chainName} service..."\nwait-for-service ${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657`,
        ],
        env: [
          {
            name: 'NAMESPACE',
            valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } },
          },
        ],
      };
    });
  }

  /**
   * Generate common volume mounts
   */
  protected generateCommonVolumeMounts(): VolumeMount[] {
    return [
      { mountPath: '/root', name: 'relayer' },
      { mountPath: '/configs', name: 'relayer-config' },
      { mountPath: '/keys', name: 'keys' },
      { mountPath: '/scripts', name: 'scripts' },
    ];
  }
}
