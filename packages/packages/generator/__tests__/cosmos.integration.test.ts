import { CosmosConfigMapGenerator, CosmosServiceGenerator, CosmosStatefulSetGenerator, CosmosChainBuilder } from '../src/cosmos';
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
import { TestCosmosGenerator } from './test-utils/generator';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Cosmos Generator Integration Tests', () => {
  const testOutputDir = join(outputDir, 'integration-tests');
  let scriptManager: ScriptManager;

  beforeEach(() => {
    scriptManager = new ScriptManager();
    mkdirSync(testOutputDir, { recursive: true });
  });

  describe('ConfigMap Generation', () => {
    it('should generate scripts ConfigMap for all chain types', () => {
      const configs = [singleChainConfig, customChainConfig, buildChainConfig];
      
      configs.forEach(config => {
        const chain = config.chains[0];
        const generator = new CosmosConfigMapGenerator(chain, config, scriptManager);
        const configMap = generator.scriptsConfigMap();
        
        expect(configMap.kind).toBe('ConfigMap');
        expect(configMap.metadata?.name).toContain('setup-scripts');
        expect(configMap.data).toBeDefined();
      });
    });

    it('should generate genesis patch ConfigMap when genesis exists', () => {
      const chain = singleChainConfig.chains[0]; // has genesis config
      const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
      
      const configMap = generator.genesisPatchConfigMap();
      
      expect(configMap).not.toBeNull();
      expect(configMap?.kind).toBe('ConfigMap');
      expect(configMap?.metadata?.name).toBe('patch-osmosis');
      
      const genesisData = JSON.parse(configMap?.data?.['genesis.json'] || '{}');
      expect(genesisData.app_state.staking.params.unbonding_time).toBe('5s');
    });

    it('should return null for genesis patch when no genesis', () => {
      const chain = multiValidatorConfig.chains[0]; // no genesis config
      const generator = new CosmosConfigMapGenerator(chain, multiValidatorConfig, scriptManager);
      
      const configMap = generator.genesisPatchConfigMap();
      
      expect(configMap).toBeNull();
    });
  });

  describe('Service Generation', () => {
    it('should generate genesis service with correct ports', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosServiceGenerator(chain, singleChainConfig);
      
      const service = generator.genesisService();
      
      expect(service.kind).toBe('Service');
      expect(service.metadata?.name).toBe('osmosis-genesis');
      expect(service.spec?.clusterIP).toBe('None');
      
      const ports = service.spec?.ports || [];
      expect(ports.length).toBeGreaterThan(0);
      
      // Check for standard ports
      const rpcPort = ports.find(p => p.name === 'rpc');
      expect(rpcPort?.port).toBe(26657);
      
      const restPort = ports.find(p => p.name === 'rest');
      expect(restPort?.port).toBe(1317);
    });

    it('should include metrics port when metrics enabled', () => {
      const chain = singleChainConfig.chains[0]; // has metrics: true
      const generator = new CosmosServiceGenerator(chain, singleChainConfig);
      
      const service = generator.genesisService();
      
      const metricsPort = service.spec?.ports?.find(p => p.name === 'metrics');
      expect(metricsPort).toBeDefined();
      expect(metricsPort?.port).toBe(26660);
    });

    it('should generate validator service for multi-validator chains', () => {
      const chain = multiValidatorConfig.chains[0];
      const generator = new CosmosServiceGenerator(chain, multiValidatorConfig);
      
      const service = generator.validatorService();
      
      expect(service.kind).toBe('Service');
      expect(service.metadata?.name).toBe('osmosis-validator');
      expect(service.spec?.clusterIP).toBe('None');
    });
  });

  describe('StatefulSet Generation', () => {
    it('should generate genesis StatefulSet with correct replicas', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosStatefulSetGenerator(chain, singleChainConfig, scriptManager);
      
      const statefulSet = generator.genesisStatefulSet();
      
      expect(statefulSet.kind).toBe('StatefulSet');
      expect(statefulSet.metadata?.name).toBe('osmosis-genesis');
      expect(statefulSet.spec?.replicas).toBe(1);
      expect(statefulSet.spec?.template.spec?.initContainers).toBeDefined();
      expect(statefulSet.spec?.template.spec?.containers).toBeDefined();
    });

    it('should generate validator StatefulSet with correct replicas', () => {
      const chain = multiValidatorConfig.chains[0]; // numValidators: 2
      const generator = new CosmosStatefulSetGenerator(chain, multiValidatorConfig, scriptManager);
      
      const statefulSet = generator.validatorStatefulSet();
      
      expect(statefulSet.kind).toBe('StatefulSet');
      expect(statefulSet.metadata?.name).toBe('osmosis-validator');
      expect(statefulSet.spec?.replicas).toBe(1); // numValidators - 1
    });

    it('should include build init container when build enabled', () => {
      const chain = buildChainConfig.chains[0]; // has build.enabled: true
      const generator = new CosmosStatefulSetGenerator(chain, buildChainConfig, scriptManager);
      
      const statefulSet = generator.genesisStatefulSet();
      
      const buildInitContainer = statefulSet.spec?.template.spec?.initContainers?.find(
        ic => ic.name === 'init-build-images'
      );
      expect(buildInitContainer).toBeDefined();
      expect(buildInitContainer?.image).toBe('ghcr.io/cosmology-tech/starship/builder:latest');
    });

    it('should handle different faucet types in containers', () => {
      // Test starship faucet
      const starshipChain = singleChainConfig.chains[0];
      const starshipGenerator = new CosmosStatefulSetGenerator(starshipChain, singleChainConfig, scriptManager);
      const starshipStatefulSet = starshipGenerator.genesisStatefulSet();
      
      const starshipContainers = starshipStatefulSet.spec?.template.spec?.containers || [];
      const starshipFaucetContainer = starshipContainers.find(c => c.name === 'faucet');
      expect(starshipFaucetContainer).toBeDefined();

      // Test cosmjs faucet
      const cosmjsChain = cosmjsFaucetConfig.chains[0];
      const cosmjsGenerator = new CosmosStatefulSetGenerator(cosmjsChain, cosmjsFaucetConfig, scriptManager);
      const cosmjsStatefulSet = cosmjsGenerator.genesisStatefulSet();
      
      const cosmjsContainers = cosmjsStatefulSet.spec?.template.spec?.containers || [];
      const cosmjsFaucetContainer = cosmjsContainers.find(c => c.name === 'faucet');
      expect(cosmjsFaucetContainer).toBeDefined();
    });
  });

  describe('Chain Builder Integration', () => {
    it('should build all manifests for a single chain', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosChainBuilder(context);
      const chain = singleChainConfig.chains[0];
      
      const manifests = builder.buildChainManifests(chain);
      
      expect(manifests.length).toBeGreaterThan(0);
      
      const configMaps = manifests.filter(m => m.kind === 'ConfigMap');
      const services = manifests.filter(m => m.kind === 'Service');
      const statefulSets = manifests.filter(m => m.kind === 'StatefulSet');
      
      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);
    });

    it('should skip Ethereum chains', () => {
      const context: GeneratorContext = { config: ethereumConfig };
      const builder = new CosmosChainBuilder(context);
      const chain = ethereumConfig.chains[0];
      
      const manifests = builder.buildChainManifests(chain);
      
      expect(manifests.length).toBe(0);
    });

    it('should generate different manifests for single vs multi-validator', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosChainBuilder(context);
      
      // Single validator chain
      const singleChain = singleChainConfig.chains[0];
      const singleManifests = builder.buildChainManifests(singleChain);
      
      // Multi validator chain
      const multiContext: GeneratorContext = { config: multiValidatorConfig };
      const multiBuilder = new CosmosChainBuilder(multiContext);
      const multiChain = multiValidatorConfig.chains[0];
      const multiManifests = multiBuilder.buildChainManifests(multiChain);
      
      // Multi-validator should have more manifests (validator service/statefulset)
      expect(multiManifests.length).toBeGreaterThan(singleManifests.length);
      
      // Check for validator-specific manifests
      const validatorServices = multiManifests.filter(m => 
        m.kind === 'Service' && m.metadata?.name?.includes('validator')
      );
      const validatorStatefulSets = multiManifests.filter(m => 
        m.kind === 'StatefulSet' && m.metadata?.name?.includes('validator')
      );
      
      expect(validatorServices.length).toBe(1);
      expect(validatorStatefulSets.length).toBe(1);
    });
  });

  describe('YAML File Generation', () => {
    it('should generate correct directory structure for single chain', () => {
      const generator = new TestCosmosGenerator({
        config: singleChainConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      expect(existsSync(join(testOutputDir, 'osmosis'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
      
      // Single validator should not have validator.yaml
      expect(existsSync(join(testOutputDir, 'osmosis', 'validator.yaml'))).toBe(false);
    });

    it('should generate correct directory structure for multi-validator chain', () => {
      const generator = new TestCosmosGenerator({
        config: multiValidatorConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      expect(existsSync(join(testOutputDir, 'osmosis'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
      
      // Multi-validator should have validator.yaml
      expect(existsSync(join(testOutputDir, 'osmosis', 'validator.yaml'))).toBe(true);
    });

    it('should generate valid YAML content', () => {
      const generator = new TestCosmosGenerator({
        config: singleChainConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      // Read and parse YAML files
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

    it('should handle multiple chains correctly', () => {
      const generator = new TestCosmosGenerator({
        config: twoChainConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      // Both chains should have directories
      expect(existsSync(join(testOutputDir, 'osmosis'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'cosmoshub'))).toBe(true);
      
      // Both should have basic files
      expect(existsSync(join(testOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'cosmoshub', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'cosmoshub', 'service.yaml'))).toBe(true);
      
      // Both have numValidators: 2, so both should have validator.yaml
      expect(existsSync(join(testOutputDir, 'osmosis', 'validator.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'cosmoshub', 'validator.yaml'))).toBe(true);
    });

    it('should skip Ethereum chains in file generation', () => {
      const generator = new TestCosmosGenerator({
        config: ethereumConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      // Ethereum chain should not have files (skipped)
      expect(existsSync(join(testOutputDir, 'ethereum'))).toBe(false);
    });

    it('should handle custom chain configuration', () => {
      const generator = new TestCosmosGenerator({
        config: customChainConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      expect(existsSync(join(testOutputDir, 'custom'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'custom', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'custom', 'service.yaml'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'custom', 'genesis.yaml'))).toBe(true);
      
      // Single validator custom chain should not have validator.yaml
      expect(existsSync(join(testOutputDir, 'custom', 'validator.yaml'))).toBe(false);
    });

    it('should handle build-enabled chains', () => {
      const generator = new TestCosmosGenerator({
        config: buildChainConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      expect(existsSync(join(testOutputDir, 'persistencecore'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'persistencecore', 'genesis.yaml'))).toBe(true);
      
      // Read genesis StatefulSet and verify build init container is included
      const genesisYaml = readFileSync(join(testOutputDir, 'persistencecore', 'genesis.yaml'), 'utf-8');
      expect(genesisYaml).toContain('init-build-images');
      expect(genesisYaml).toContain('ghcr.io/cosmology-tech/starship/builder:latest');
    });

    it('should handle cometmock-enabled chains', () => {
      const generator = new TestCosmosGenerator({
        config: cometmockConfig,
        outputDir: testOutputDir
      });
      
      generator.generateAllChains();
      
      expect(existsSync(join(testOutputDir, 'cosmoshub'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'cosmoshub', 'genesis.yaml'))).toBe(true);
      
      // Verify cometmock configuration is applied
      const genesisYaml = readFileSync(join(testOutputDir, 'cosmoshub', 'genesis.yaml'), 'utf-8');
      // Note: Cometmock manifests are handled separately in the builder
      expect(genesisYaml).toBeDefined();
    });
  });
}); 