import { StarshipConfig, Chain } from '@starship-ci/types/src';
import { CosmosChainBuilder } from '../../src/cosmos';
import { GeneratorContext } from '../../src/types';
import * as yaml from 'js-yaml';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigMap, Service, StatefulSet } from 'kubernetesjs';

export interface TestGeneratorContext {
  config: StarshipConfig;
  outputDir: string;
}

export class TestCosmosGenerator {
  private builder: CosmosChainBuilder;
  private context: TestGeneratorContext;

  constructor(context: TestGeneratorContext) {
    this.context = context;
    const generatorContext: GeneratorContext = {
      config: context.config
    };
    this.builder = new CosmosChainBuilder(generatorContext);
  }

  /**
   * Generate all manifests for all chains and write to YAML files
   */
  generateAllChains(): void {
    for (const chain of this.context.config.chains) {
      this.generateChain(chain);
    }
  }

  /**
   * Generate manifests for a single chain and write to YAML files
   */
  generateChain(chain: Chain): void {
    const manifests = this.builder.buildChainManifests(chain);
    this.writeChainManifests(chain, manifests);
  }

  /**
   * Write chain manifests to the requested directory structure:
   * <chain.name>/
   *   genesis.yaml: genesis yaml file
   *   validator.yaml: validator statefulset, if exists
   *   service.yaml: services for deployments
   *   configmap.yaml: configmaps for the chain
   */
  private writeChainManifests(chain: Chain, manifests: Array<ConfigMap | Service | StatefulSet>): void {
    const chainName = chain.name || String(chain.id);
    const chainDir = join(this.context.outputDir, chainName);
    
    // Create chain directory
    mkdirSync(chainDir, { recursive: true });

    // Separate manifests by type
    const configMaps = manifests.filter(m => m.kind === 'ConfigMap') as ConfigMap[];
    const services = manifests.filter(m => m.kind === 'Service') as Service[];
    const statefulSets = manifests.filter(m => m.kind === 'StatefulSet') as StatefulSet[];

    // Write ConfigMaps
    if (configMaps.length > 0) {
      const configMapYaml = configMaps.map(cm => yaml.dump(cm)).join('---\n');
      writeFileSync(join(chainDir, 'configmap.yaml'), configMapYaml);
    }

    // Write Services
    if (services.length > 0) {
      const serviceYaml = services.map(svc => yaml.dump(svc)).join('---\n');
      writeFileSync(join(chainDir, 'service.yaml'), serviceYaml);
    }

    // Write StatefulSets - separate genesis and validator
    const genesisStatefulSets = statefulSets.filter(ss => 
      ss.metadata?.name?.includes('genesis')
    );
    const validatorStatefulSets = statefulSets.filter(ss => 
      ss.metadata?.name?.includes('validator') && !ss.metadata?.name?.includes('genesis')
    );

    if (genesisStatefulSets.length > 0) {
      const genesisYaml = genesisStatefulSets.map(ss => yaml.dump(ss)).join('---\n');
      writeFileSync(join(chainDir, 'genesis.yaml'), genesisYaml);
    }

    if (validatorStatefulSets.length > 0) {
      const validatorYaml = validatorStatefulSets.map(ss => yaml.dump(ss)).join('---\n');
      writeFileSync(join(chainDir, 'validator.yaml'), validatorYaml);
    }
  }

  /**
   * Get all manifests for a chain without writing to files
   */
  getChainManifests(chain: Chain): Array<ConfigMap | Service | StatefulSet> {
    return this.builder.buildChainManifests(chain);
  }
} 