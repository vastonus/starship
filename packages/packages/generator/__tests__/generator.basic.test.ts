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

  it('should generate basic ConfigMap', () => {
    const chain = singleChainConfig.chains[0]; // osmosis-1
    const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
        
    const configMap = generator.scriptsConfigMap();
    
    expect(configMap).toBeDefined();
    expect(configMap.kind).toBe('ConfigMap');
    expect(configMap.metadata?.name).toBe('setup-scripts-osmosis');
  });

  it('should generate basic Service', () => {
    const chain = singleChainConfig.chains[0]; // osmosis-1
    const generator = new CosmosServiceGenerator(chain, singleChainConfig);
    
    const service = generator.genesisService();
    
    expect(service).toBeDefined();
    expect(service.kind).toBe('Service');
    expect(service.metadata?.name).toBe('osmosis-genesis');
  });

  it('should generate ConfigMap with genesis patch when genesis exists', () => {
    const chain = singleChainConfig.chains[0]; // has genesis config
    const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
    
    const configMap = generator.genesisPatchConfigMap();
    
    expect(configMap).not.toBeNull();
    expect(configMap?.kind).toBe('ConfigMap');
    expect(configMap?.metadata?.name).toBe('patch-osmosis');
    expect(configMap?.data?.['genesis.json']).toBeDefined();
  });

  it('should return null for genesis patch when no genesis', () => {
    const chain = multiValidatorConfig.chains[0]; // no genesis config
    const generator = new CosmosConfigMapGenerator(chain, multiValidatorConfig, scriptManager);
    
    const configMap = generator.genesisPatchConfigMap();
    
    expect(configMap).toBeNull();
  });

  it('should include metrics port when metrics enabled', () => {
    const chain = singleChainConfig.chains[0]; // has metrics: true
    const generator = new CosmosServiceGenerator(chain, singleChainConfig);
    
    const service = generator.genesisService();
    
    const metricsPort = service.spec?.ports?.find(p => p.name === 'metrics');
    expect(metricsPort).toBeDefined();
    expect(metricsPort?.port).toBe(26660);
  });

  it('should handle different faucet types', () => {
    // Test starship faucet
    const starshipChain = singleChainConfig.chains[0];
    const starshipGenerator = new CosmosServiceGenerator(starshipChain, singleChainConfig);
    const starshipService = starshipGenerator.genesisService();
    expect(starshipService).toBeDefined();

    // Test cosmjs faucet
    const cosmjsChain = cosmjsFaucetConfig.chains[0];
    const cosmjsGenerator = new CosmosServiceGenerator(cosmjsChain, cosmjsFaucetConfig);
    const cosmjsService = cosmjsGenerator.genesisService();
    expect(cosmjsService).toBeDefined();
  });
});

describe('YAML File Generation Tests', () => {
  const testOutputDir = join(outputDir, 'basic-tests');

  beforeEach(() => {
    mkdirSync(testOutputDir, { recursive: true });
  });

  it('should create CosmosBuilder', () => {
    const context: GeneratorContext = { config: singleChainConfig };
    const builder = new CosmosBuilder(context, testOutputDir);
    
    expect(builder).toBeDefined();
  });

  it('should generate chain directory structure', () => {
    const context: GeneratorContext = { config: singleChainConfig };
    const builder = new CosmosBuilder(context, testOutputDir);
    
    const chain = singleChainConfig.chains[0]; // osmosis-1
    builder.generateFiles(chain);
    
    // Check that chain directory was created
    expect(existsSync(join(testOutputDir, 'osmosis'))).toBe(true);
  });

  it('should generate YAML files for single validator chain', () => {
    const context: GeneratorContext = { config: singleChainConfig };
    const builder = new CosmosBuilder(context, testOutputDir);
    
    const chain = singleChainConfig.chains[0]; // osmosis-1 with numValidators: 1
    builder.generateFiles(chain);
    
    // Check that YAML files were created
    expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
    
    // Single validator should not have validator.yaml
    expect(existsSync(join(testOutputDir, 'osmosis', 'validator.yaml'))).toBe(false);
  });

  it('should generate YAML files for multi-validator chain', () => {
    const context: GeneratorContext = { config: multiValidatorConfig };
    const builder = new CosmosBuilder(context, testOutputDir);
    
    const chain = multiValidatorConfig.chains[0]; // osmosis-1 with numValidators: 2
    builder.generateFiles(chain);
    
    // Check that YAML files were created
    expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
    
    // Multi-validator should have validator.yaml
    expect(existsSync(join(testOutputDir, 'osmosis', 'validator.yaml'))).toBe(true);
  });

  it('should skip Ethereum chains', () => {
    const context: GeneratorContext = { config: ethereumConfig };
    const builder = new CosmosBuilder(context, testOutputDir);
    
    builder.generateAllFiles();
    
    // Ethereum chain should not have files (skipped)
    expect(existsSync(join(testOutputDir, 'ethereum'))).toBe(false);
  });

  it('should generate multiple chains', () => {
    const context: GeneratorContext = { config: twoChainConfig };
    const builder = new CosmosBuilder(context, testOutputDir);
    
    builder.generateAllFiles();
    
    // Both chains should have directories
    expect(existsSync(join(testOutputDir, 'osmosis'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmoshub'))).toBe(true);
    
    // Both should have basic files
    expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
    expect(existsSync(join(testOutputDir, 'cosmoshub', 'configmap.yaml'))).toBe(true);
  });
}); 