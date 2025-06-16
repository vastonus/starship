import { CosmosConfigMapGenerator, CosmosServiceGenerator, CosmosStatefulSetGenerator, CosmosChainBuilder } from '../src/cosmos';
import { GeneratorContext } from '../src/types';
import { DefaultsManager } from '../src/defaults';
import { ScriptManager } from '../src/scripts';
import { simpleConfig, complexConfig, outputDir } from './test-utils/config';
import { TestCosmosGenerator } from './test-utils/generator';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('CosmosConfigMapGenerator', () => {
  let scriptManager: ScriptManager;
  let defaultsManager: DefaultsManager;

  beforeEach(() => {
    scriptManager = new ScriptManager();
    defaultsManager = new DefaultsManager();
  });

  it('should generate scripts ConfigMap', () => {
    const chain = simpleConfig.config.chains[0]; // osmosis-1
    const generator = new CosmosConfigMapGenerator(chain, simpleConfig.config, scriptManager);
    
    const configMap = generator.scriptsConfigMap();
    
    expect(configMap.kind).toBe('ConfigMap');
    expect(configMap.metadata?.name).toBe('setup-scripts-osmosis');
    expect(configMap.data).toBeDefined();
    expect(configMap.data?.['create-genesis.sh']).toContain('Creating genesis for osmosis');
  });

  it('should generate genesis patch ConfigMap when genesis exists', () => {
    const chain = complexConfig.config.chains[0]; // provider-1 with genesis
    const generator = new CosmosConfigMapGenerator(chain, complexConfig.config, scriptManager);
    
    const configMap = generator.genesisPatchConfigMap();
    
    expect(configMap).not.toBeNull();
    expect(configMap?.kind).toBe('ConfigMap');
    expect(configMap?.metadata?.name).toBe('patch-provider');
    expect(configMap?.data?.['genesis.json']).toBeDefined();
  });

  it('should return null for genesis patch ConfigMap when no genesis', () => {
    const chain = simpleConfig.config.chains[0]; // osmosis-1 without genesis
    const generator = new CosmosConfigMapGenerator(chain, simpleConfig.config, scriptManager);
    
    const configMap = generator.genesisPatchConfigMap();
    
    expect(configMap).toBeNull();
  });

  it('should generate ICS consumer proposal ConfigMap when ICS enabled', () => {
    const chain = complexConfig.config.chains[1]; // consumer-1 with ICS
    const generator = new CosmosConfigMapGenerator(chain, complexConfig.config, scriptManager);
    
    const configMap = generator.icsConsumerProposalConfigMap();
    
    expect(configMap).not.toBeNull();
    expect(configMap?.kind).toBe('ConfigMap');
    expect(configMap?.metadata?.name).toBe('consumer-proposal-consumer');
    expect(configMap?.data?.['proposal.json']).toBeDefined();
  });
});

describe('CosmosServiceGenerator', () => {
  it('should generate genesis service', () => {
    const chain = simpleConfig.config.chains[0]; // osmosis-1
    const generator = new CosmosServiceGenerator(chain, simpleConfig.config);
    
    const service = generator.genesisService();
    
    expect(service.kind).toBe('Service');
    expect(service.metadata?.name).toBe('osmosis-genesis');
    expect(service.spec?.clusterIP).toBe('None');
    expect(service.spec?.ports).toBeDefined();
    expect(service.spec?.ports?.length).toBeGreaterThan(0);
  });

  it('should generate validator service', () => {
    const chain = simpleConfig.config.chains[0]; // osmosis-1
    const generator = new CosmosServiceGenerator(chain, simpleConfig.config);
    
    const service = generator.validatorService();
    
    expect(service.kind).toBe('Service');
    expect(service.metadata?.name).toBe('osmosis-validator');
    expect(service.spec?.clusterIP).toBe('None');
    expect(service.spec?.ports).toBeDefined();
  });

  it('should include metrics port when metrics enabled', () => {
    const chain = complexConfig.config.chains[0]; // provider-1 with metrics
    const generator = new CosmosServiceGenerator(chain, complexConfig.config);
    
    const service = generator.genesisService();
    
    const metricsPort = service.spec?.ports?.find(p => p.name === 'metrics');
    expect(metricsPort).toBeDefined();
    expect(metricsPort?.port).toBe(26660);
  });
});

describe('CosmosStatefulSetGenerator', () => {
  let scriptManager: ScriptManager;

  beforeEach(() => {
    scriptManager = new ScriptManager();
  });

  it('should generate genesis StatefulSet', () => {
    const chain = simpleConfig.config.chains[0]; // osmosis-1
    const generator = new CosmosStatefulSetGenerator(chain, simpleConfig.config, scriptManager);
    
    const statefulSet = generator.genesisStatefulSet();
    
    expect(statefulSet.kind).toBe('StatefulSet');
    expect(statefulSet.metadata?.name).toBe('osmosis-genesis');
    expect(statefulSet.spec?.replicas).toBe(1);
    expect(statefulSet.spec?.template.spec?.initContainers).toBeDefined();
    expect(statefulSet.spec?.template.spec?.containers).toBeDefined();
  });

  it('should generate validator StatefulSet with correct replicas', () => {
    const chain = simpleConfig.config.chains[0]; // osmosis-1 with numValidators: 2
    const generator = new CosmosStatefulSetGenerator(chain, simpleConfig.config, scriptManager);
    
    const statefulSet = generator.validatorStatefulSet();
    
    expect(statefulSet.kind).toBe('StatefulSet');
    expect(statefulSet.metadata?.name).toBe('osmosis-validator');
    expect(statefulSet.spec?.replicas).toBe(1); // numValidators - 1
  });

  it('should include build init container when build enabled', () => {
    const chain = complexConfig.config.chains[0]; // provider-1 with build enabled
    const generator = new CosmosStatefulSetGenerator(chain, complexConfig.config, scriptManager);
    
    const statefulSet = generator.genesisStatefulSet();
    
    const buildInitContainer = statefulSet.spec?.template.spec?.initContainers?.find(
      ic => ic.name === 'init-build-images'
    );
    expect(buildInitContainer).toBeDefined();
    expect(buildInitContainer?.image).toBe('ghcr.io/cosmology-tech/starship/builder:latest');
  });

  it('should include upgrade logic when upgrade enabled', () => {
    const chain = complexConfig.config.chains[1]; // consumer-1 with upgrade enabled
    const generator = new CosmosStatefulSetGenerator(chain, complexConfig.config, scriptManager);
    
    const statefulSet = generator.genesisStatefulSet();
    
    const buildInitContainer = statefulSet.spec?.template.spec?.initContainers?.find(
      ic => ic.name === 'init-build-images'
    );
    expect(buildInitContainer).toBeDefined();
    
    // Check that upgrade commands are included
    const commands = buildInitContainer?.command;
    expect(commands).toBeDefined();
    expect(commands?.[2]).toContain('UPGRADE_NAME=v8');
    expect(commands?.[2]).toContain('UPGRADE_NAME=v9');
  });
});

describe('CosmosChainBuilder', () => {
  let context: GeneratorContext;

  beforeEach(() => {
    context = {
      config: simpleConfig.config,
      outputDir: outputDir
    };
  });

  it('should build all manifests for a chain', () => {
    const builder = new CosmosChainBuilder(context);
    const chain = simpleConfig.config.chains[0]; // osmosis-1
    
    const manifests = builder.buildChainManifests(chain);
    
    expect(manifests.length).toBeGreaterThan(0);
    
    // Check that we have the expected types
    const configMaps = manifests.filter(m => m.kind === 'ConfigMap');
    const services = manifests.filter(m => m.kind === 'Service');
    const statefulSets = manifests.filter(m => m.kind === 'StatefulSet');
    
    expect(configMaps.length).toBeGreaterThan(0);
    expect(services.length).toBeGreaterThan(0);
    expect(statefulSets.length).toBeGreaterThan(0);
  });

  it('should skip Ethereum chains', () => {
    const builder = new CosmosChainBuilder(context);
    const chain = complexConfig.config.chains[2]; // ethereum-1
    
    const manifests = builder.buildChainManifests(chain);
    
    expect(manifests.length).toBe(0);
  });

  it('should generate validator manifests only when numValidators > 1', () => {
    const builder = new CosmosChainBuilder(context);
    const singleValidatorChain = simpleConfig.config.chains[1]; // cosmos-2 with numValidators: 1
    const multiValidatorChain = simpleConfig.config.chains[0]; // osmosis-1 with numValidators: 2
    
    const singleManifests = builder.buildChainManifests(singleValidatorChain);
    const multiManifests = builder.buildChainManifests(multiValidatorChain);
    
    // Single validator should not have validator service/statefulset
    const singleValidatorServices = singleManifests.filter(m => 
      m.kind === 'Service' && m.metadata?.name?.includes('validator')
    );
    const singleValidatorStatefulSets = singleManifests.filter(m => 
      m.kind === 'StatefulSet' && m.metadata?.name?.includes('validator')
    );
    
    expect(singleValidatorServices.length).toBe(0);
    expect(singleValidatorStatefulSets.length).toBe(0);
    
    // Multi validator should have validator service/statefulset
    const multiValidatorServices = multiManifests.filter(m => 
      m.kind === 'Service' && m.metadata?.name?.includes('validator')
    );
    const multiValidatorStatefulSets = multiManifests.filter(m => 
      m.kind === 'StatefulSet' && m.metadata?.name?.includes('validator')
    );
    
    expect(multiValidatorServices.length).toBe(1);
    expect(multiValidatorStatefulSets.length).toBe(1);
  });
});

describe('Full Generator Integration Tests', () => {
  const testOutputDir = join(outputDir, 'integration-tests');

  beforeEach(() => {
    // Clean up and create test output directory
    mkdirSync(testOutputDir, { recursive: true });
  });

  it('should generate YAML files for simple config', () => {
    const generator = new TestCosmosGenerator({
      config: simpleConfig.config,
      outputDir: testOutputDir
    });
    
    generator.generateAllChains();
    
    // Check that directories were created
    expect(existsSync(join(testOutputDir, 'osmosis'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmos'))).toBe(true);
    
    // Check that YAML files were created for osmosis (multi-validator)
    expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'validator.yaml'))).toBe(true);
    
    // Check that YAML files were created for cosmos (single validator - no validator.yaml)
    expect(existsSync(join(testOutputDir, 'cosmos', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmos', 'service.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmos', 'genesis.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmos', 'validator.yaml'))).toBe(false);
  });

  it('should generate valid YAML content', () => {
    const generator = new TestCosmosGenerator({
      config: simpleConfig.config,
      outputDir: testOutputDir
    });
    
    generator.generateChain(simpleConfig.config.chains[0]); // osmosis-1
    
    // Read and parse the generated YAML files
    const configMapYaml = readFileSync(join(testOutputDir, 'osmosis', 'configmap.yaml'), 'utf-8');
    const serviceYaml = readFileSync(join(testOutputDir, 'osmosis', 'service.yaml'), 'utf-8');
    const genesisYaml = readFileSync(join(testOutputDir, 'osmosis', 'genesis.yaml'), 'utf-8');
    
    // Parse YAML to ensure it's valid
    const configMaps = yaml.loadAll(configMapYaml);
    const services = yaml.loadAll(serviceYaml);
    const genesis = yaml.loadAll(genesisYaml);
    
    expect(configMaps.length).toBeGreaterThan(0);
    expect(services.length).toBeGreaterThan(0);
    expect(genesis.length).toBeGreaterThan(0);
    
    // Verify structure
    const firstConfigMap = configMaps[0] as any;
    expect(firstConfigMap.kind).toBe('ConfigMap');
    expect(firstConfigMap.metadata.name).toContain('osmosis');
    
    const firstService = services[0] as any;
    expect(firstService.kind).toBe('Service');
    expect(firstService.metadata.name).toContain('osmosis');
    
    const firstGenesis = genesis[0] as any;
    expect(firstGenesis.kind).toBe('StatefulSet');
    expect(firstGenesis.metadata.name).toContain('genesis');
  });

  it('should generate complex config with ICS and build features', () => {
    const generator = new TestCosmosGenerator({
      config: complexConfig.config,
      outputDir: testOutputDir
    });
    
    generator.generateAllChains();
    
    // Check provider chain
    expect(existsSync(join(testOutputDir, 'provider'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'provider', 'configmap.yaml'))).toBe(true);
    
    // Check consumer chain with ICS
    expect(existsSync(join(testOutputDir, 'consumer'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'consumer', 'configmap.yaml'))).toBe(true);
    
    // Verify ICS consumer proposal ConfigMap is included
    const consumerConfigMapYaml = readFileSync(join(testOutputDir, 'consumer', 'configmap.yaml'), 'utf-8');
    expect(consumerConfigMapYaml).toContain('consumer-proposal-consumer');
    
    // Verify genesis patch ConfigMap is included for provider
    const providerConfigMapYaml = readFileSync(join(testOutputDir, 'provider', 'configmap.yaml'), 'utf-8');
    expect(providerConfigMapYaml).toContain('patch-provider');
    
    // Ethereum chain should not have files (skipped)
    expect(existsSync(join(testOutputDir, 'ethereum'))).toBe(false);
  });

  it('should handle chains with different faucet types', () => {
    const generator = new TestCosmosGenerator({
      config: simpleConfig.config,
      outputDir: testOutputDir
    });
    
    // Generate both chains - one with starship faucet, one with cosmjs faucet
    generator.generateAllChains();
    
    // Both should generate successfully
    expect(existsSync(join(testOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmos', 'genesis.yaml'))).toBe(true);
    
    // Read genesis StatefulSets and verify faucet containers are different
    const osmosisGenesisYaml = readFileSync(join(testOutputDir, 'osmosis', 'genesis.yaml'), 'utf-8');
    const cosmosGenesisYaml = readFileSync(join(testOutputDir, 'cosmos', 'genesis.yaml'), 'utf-8');
    
    // Osmosis uses starship faucet (busybox image)
    expect(osmosisGenesisYaml).toContain('busybox:1.34.1');
    
    // Cosmos uses cosmjs faucet (different setup)
    expect(cosmosGenesisYaml).toContain('yarn start');
  });
})
