import { CosmosConfigMapGenerator, CosmosServiceGenerator, CosmosBuilder } from '../src/cosmos';
import { GeneratorContext } from '../src/types';
import { ScriptManager } from '../src/scripts';
import { 
  singleChainConfig, 
  multiValidatorConfig, 
  customChainConfig,
  cosmjsFaucetConfig,
  buildChainConfig,
  cometmockConfig,
  twoChainConfig,
  ethereumConfig,
  outputDir 
} from './test-utils/config';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('Basic Generator Tests', () => {
  let scriptManager: ScriptManager;

  beforeEach(() => {
    scriptManager = new ScriptManager();
  });

  it('should create CosmosConfigMapGenerator', () => {
    const chain = singleChainConfig.chains[0];
    const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
    
    expect(generator).toBeDefined();
  });

  it('should create CosmosServiceGenerator', () => {
    const chain = singleChainConfig.chains[0];
    const generator = new CosmosServiceGenerator(chain, singleChainConfig);
    
    expect(generator).toBeDefined();
  });

  it('should create CosmosBuilder', () => {
    const context: GeneratorContext = {
      config: singleChainConfig
    };
    const builder = new CosmosBuilder(context);
    
    expect(builder).toBeDefined();
  });

  describe('ConfigMap Generation Snapshots', () => {
    it('should generate basic ConfigMap - snapshot', () => {
      const chain = singleChainConfig.chains[0]; // osmosis-1
      const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
      
      const configMap = generator.scriptsConfigMap();
      
      // Manual checks
      expect(configMap).toBeDefined();
      expect(configMap.kind).toBe('ConfigMap');
      expect(configMap.metadata?.name).toBe('setup-scripts-osmosis');
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('osmosis-scripts-configmap');
    });

    it('should generate genesis patch ConfigMap when genesis exists - snapshot', () => {
      const chain = singleChainConfig.chains[0]; // has genesis config
      const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
      
      const configMap = generator.genesisPatchConfigMap();
      
      // Manual checks
      expect(configMap).not.toBeNull();
      expect(configMap?.kind).toBe('ConfigMap');
      expect(configMap?.metadata?.name).toBe('patch-osmosis');
      expect(configMap?.data?.['genesis.json']).toBeDefined();
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('osmosis-genesis-patch-configmap');
    });

    it('should return null for genesis patch when no genesis - snapshot', () => {
      const chain = multiValidatorConfig.chains[0]; // no genesis config
      const generator = new CosmosConfigMapGenerator(chain, multiValidatorConfig, scriptManager);
      
      const configMap = generator.genesisPatchConfigMap();
      
      // Manual check
      expect(configMap).toBeNull();
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('null-genesis-patch-configmap');
    });
  });

  describe('Service Generation Snapshots', () => {
    it('should generate basic Service - snapshot', () => {
      const chain = singleChainConfig.chains[0]; // osmosis-1
      const generator = new CosmosServiceGenerator(chain, singleChainConfig);
      
      const service = generator.genesisService();
      
      // Manual checks
      expect(service).toBeDefined();
      expect(service.kind).toBe('Service');
      expect(service.metadata?.name).toBe('osmosis-genesis');
      
      // Snapshot test
      expect(service).toMatchSnapshot('osmosis-genesis-service');
    });

    it('should include metrics port when metrics enabled - snapshot', () => {
      const chain = singleChainConfig.chains[0]; // has metrics: true
      const generator = new CosmosServiceGenerator(chain, singleChainConfig);
      
      const service = generator.genesisService();
      
      // Manual checks
      const metricsPort = service.spec?.ports?.find(p => p.name === 'metrics');
      expect(metricsPort).toBeDefined();
      expect(metricsPort?.port).toBe(26660);
      
      // Snapshot test
      expect(service).toMatchSnapshot('osmosis-genesis-service-with-metrics');
    });

    it('should generate validator service - snapshot', () => {
      const chain = multiValidatorConfig.chains[0];
      const generator = new CosmosServiceGenerator(chain, multiValidatorConfig);
      
      const service = generator.validatorService();
      
      // Manual checks
      expect(service.kind).toBe('Service');
      expect(service.metadata?.name).toBe('osmosis-validator');
      
      // Snapshot test
      expect(service).toMatchSnapshot('osmosis-validator-service');
    });
  });

  describe('Different Chain Configurations Snapshots', () => {
    it('should handle different faucet types - snapshots', () => {
      // Test starship faucet
      const starshipChain = singleChainConfig.chains[0];
      const starshipGenerator = new CosmosServiceGenerator(starshipChain, singleChainConfig);
      const starshipService = starshipGenerator.genesisService();
      expect(starshipService).toBeDefined();
      expect(starshipService).toMatchSnapshot('starship-faucet-service');

      // Test cosmjs faucet
      const cosmjsChain = cosmjsFaucetConfig.chains[0];
      const cosmjsGenerator = new CosmosServiceGenerator(cosmjsChain, cosmjsFaucetConfig);
      const cosmjsService = cosmjsGenerator.genesisService();
      expect(cosmjsService).toBeDefined();
      expect(cosmjsService).toMatchSnapshot('cosmjs-faucet-service');
    });

    it('should handle custom chain configuration - snapshot', () => {
      const chain = customChainConfig.chains[0];
      const configMapGenerator = new CosmosConfigMapGenerator(chain, customChainConfig, scriptManager);
      const serviceGenerator = new CosmosServiceGenerator(chain, customChainConfig);
      
      const configMap = configMapGenerator.scriptsConfigMap();
      const service = serviceGenerator.genesisService();
      
      // Manual checks
      expect(configMap.metadata?.name).toBe('setup-scripts-custom');
      expect(service.metadata?.name).toBe('custom-genesis');
      
      // Snapshot tests
      expect(configMap).toMatchSnapshot('custom-chain-configmap');
      expect(service).toMatchSnapshot('custom-chain-service');
    });

    it('should handle build-enabled chain - snapshot', () => {
      const chain = buildChainConfig.chains[0];
      const generator = new CosmosServiceGenerator(chain, buildChainConfig);
      
      const service = generator.genesisService();
      
      // Manual check
      expect(service.metadata?.name).toBe('persistencecore-genesis');
      
      // Snapshot test
      expect(service).toMatchSnapshot('build-enabled-chain-service');
    });
  });

  describe('Manifest Building Snapshots', () => {
    it('should build all manifests for single chain - snapshot', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);
      const chain = singleChainConfig.chains[0];
      
      const manifests = builder.buildManifests(chain);
      
      // Manual checks
      expect(manifests.length).toBeGreaterThan(0);
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
      
      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBe(1); // Only genesis service for single validator
      expect(statefulSets.length).toBe(1); // Only genesis statefulset for single validator
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('single-chain-all-manifests');
    });

    it('should build all manifests for multi-validator chain - snapshot', () => {
      const context: GeneratorContext = { config: multiValidatorConfig };
      const builder = new CosmosBuilder(context);
      const chain = multiValidatorConfig.chains[0];
      
      const manifests = builder.buildManifests(chain);
      
      // Manual checks
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
      
      expect(services.length).toBe(2); // Genesis and validator services
      expect(statefulSets.length).toBe(2); // Genesis and validator statefulsets
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('multi-validator-chain-all-manifests');
    });

    it('should skip Ethereum chains - snapshot', () => {
      const context: GeneratorContext = { config: ethereumConfig };
      const builder = new CosmosBuilder(context);
      const chain = ethereumConfig.chains[0];
      
      const manifests = builder.buildManifests(chain);
      
      // Manual check
      expect(manifests.length).toBe(0);
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('ethereum-chain-empty-manifests');
    });
  });
});

describe('YAML File Generation Tests', () => {
  const testOutputDir = join(outputDir, 'basic-tests');

  beforeEach(() => {
    mkdirSync(testOutputDir, { recursive: true });
  });

  it('should create CosmosBuilder', () => {
    const context: GeneratorContext = { config: singleChainConfig };
    const outputPath = join(testOutputDir, 'builder-creation-test');
    const builder = new CosmosBuilder(context, outputPath);
    
    expect(builder).toBeDefined();
  });

  it('should generate chain directory structure', () => {
    const context: GeneratorContext = { config: singleChainConfig };
    const outputPath = join(testOutputDir, 'chain-directory-structure');
    const builder = new CosmosBuilder(context, outputPath);
    
    const chain = singleChainConfig.chains[0]; // osmosis-1
    builder.generateFiles(chain);
    
    // Check that chain directory was created
    expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
  });

  it('should generate YAML files for single validator chain', () => {
    const context: GeneratorContext = { config: singleChainConfig };
    const outputPath = join(testOutputDir, 'single-validator-yaml-files');
    const builder = new CosmosBuilder(context, outputPath);
    
    const chain = singleChainConfig.chains[0]; // osmosis-1 with numValidators: 1
    builder.generateFiles(chain);
    
    // Check that YAML files were created
    expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
    expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
    
    // Single validator should not have validator.yaml
    expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(false);
  });

  it('should generate YAML files for multi-validator chain', () => {
    const context: GeneratorContext = { config: multiValidatorConfig };
    const outputPath = join(testOutputDir, 'multi-validator-yaml-files');
    const builder = new CosmosBuilder(context, outputPath);
    
    const chain = multiValidatorConfig.chains[0]; // osmosis-1 with numValidators: 2
    builder.generateFiles(chain);
    
    // Check that YAML files were created
    expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
    expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
    
    // Multi-validator should have validator.yaml
    expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(true);
  });

  it('should skip Ethereum chains', () => {
    const context: GeneratorContext = { config: ethereumConfig };
    const outputPath = join(testOutputDir, 'ethereum-skip-basic-test');
    const builder = new CosmosBuilder(context, outputPath);
    
    builder.generateAllFiles();
    
    // Ethereum chain should not have files (skipped)
    expect(existsSync(join(outputPath, 'ethereum'))).toBe(false);
  });

  it('should generate multiple chains', () => {
    const context: GeneratorContext = { config: twoChainConfig };
    const outputPath = join(testOutputDir, 'multiple-chains-generation');
    const builder = new CosmosBuilder(context, outputPath);
    
    builder.generateAllFiles();
    
    // Both chains should have directories
    expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
    expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);
    
    // Both should have basic files
    expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(outputPath, 'cosmoshub', 'configmap.yaml'))).toBe(true);
  });
}); 