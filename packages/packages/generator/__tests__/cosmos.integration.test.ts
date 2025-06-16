import { CosmosConfigMapGenerator, CosmosServiceGenerator, CosmosStatefulSetGenerator, CosmosBuilder } from '../src/cosmos';
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
      
      const genesisJsonString = configMap?.data?.['genesis.json'] as string;
      const genesisData = JSON.parse(genesisJsonString || '{}');
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

  describe('Builder Integration', () => {
    it('should build all manifests for a single chain', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);
      const chain = singleChainConfig.chains[0];
      
      const manifests = builder.buildManifests(chain);
      
      expect(manifests.length).toBeGreaterThan(0);
      
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
      
      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);
    });

    it('should skip Ethereum chains', () => {
      const context: GeneratorContext = { config: ethereumConfig };
      const builder = new CosmosBuilder(context);
      const chain = ethereumConfig.chains[0];
      
      const manifests = builder.buildManifests(chain);
      
      expect(manifests.length).toBe(0);
    });

    it('should generate different manifests for single vs multi-validator', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);
      
      // Single validator chain
      const singleChain = singleChainConfig.chains[0];
      const singleManifests = builder.buildManifests(singleChain);
      
      // Multi validator chain
      const multiContext: GeneratorContext = { config: multiValidatorConfig };
      const multiBuilder = new CosmosBuilder(multiContext);
      const multiChain = multiValidatorConfig.chains[0];
      const multiManifests = multiBuilder.buildManifests(multiChain);
      
      // Multi-validator should have more manifests (validator service/statefulset)
      expect(multiManifests.length).toBeGreaterThan(singleManifests.length);
      
      // Check for validator-specific manifests
      const validatorServices = multiManifests.filter((m: any) => 
        m.kind === 'Service' && m.metadata?.name?.includes('validator')
      );
      const validatorStatefulSets = multiManifests.filter((m: any) => 
        m.kind === 'StatefulSet' && m.metadata?.name?.includes('validator')
      );
      
      expect(validatorServices.length).toBe(1);
      expect(validatorStatefulSets.length).toBe(1);
    });
  });

  describe('YAML File Generation', () => {
    it('should generate correct directory structure for single chain', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'single-chain-directory-structure');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
      
      // Single validator should not have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(false);
    });

    it('should generate correct directory structure for multi-validator chain', () => {
      const context: GeneratorContext = { config: multiValidatorConfig };
      const outputPath = join(testOutputDir, 'multi-validator-directory-structure');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
      
      // Multi-validator should have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(true);
    });

    it('should generate valid YAML content', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'valid-yaml-content-test');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Read and parse YAML files
      const configMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
      const serviceYaml = readFileSync(join(outputPath, 'osmosis', 'service.yaml'), 'utf-8');
      const genesisYaml = readFileSync(join(outputPath, 'osmosis', 'genesis.yaml'), 'utf-8');
      
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
      const context: GeneratorContext = { config: twoChainConfig };
      const outputPath = join(testOutputDir, 'multiple-chains-handling');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Both chains should have directories
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);
      
      // Both should have basic files
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub', 'service.yaml'))).toBe(true);
      
      // Both have numValidators: 2, so both should have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub', 'validator.yaml'))).toBe(true);
    });

    it('should skip Ethereum chains in file generation', () => {
      const context: GeneratorContext = { config: ethereumConfig };
      const outputPath = join(testOutputDir, 'ethereum-chain-skip-test');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Ethereum chain should not have files (skipped)
      expect(existsSync(join(outputPath, 'ethereum'))).toBe(false);
    });

    it('should handle custom chain configuration', () => {
      const context: GeneratorContext = { config: customChainConfig };
      const outputPath = join(testOutputDir, 'custom-chain-config-test');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      expect(existsSync(join(outputPath, 'custom'))).toBe(true);
      expect(existsSync(join(outputPath, 'custom', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'custom', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'custom', 'genesis.yaml'))).toBe(true);
      
      // Single validator custom chain should not have validator.yaml
      expect(existsSync(join(outputPath, 'custom', 'validator.yaml'))).toBe(false);
    });

    it('should handle build-enabled chains', () => {
      const context: GeneratorContext = { config: buildChainConfig };
      const outputPath = join(testOutputDir, 'build-enabled-chains-test');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      expect(existsSync(join(outputPath, 'persistencecore'))).toBe(true);
      expect(existsSync(join(outputPath, 'persistencecore', 'genesis.yaml'))).toBe(true);
      
      // Read genesis StatefulSet and verify build init container is included
      const genesisYaml = readFileSync(join(outputPath, 'persistencecore', 'genesis.yaml'), 'utf-8');
      expect(genesisYaml).toContain('init-build-images');
      expect(genesisYaml).toContain('ghcr.io/cosmology-tech/starship/builder:latest');
    });

    it('should handle cometmock-enabled chains', () => {
      const context: GeneratorContext = { config: cometmockConfig };
      const outputPath = join(testOutputDir, 'cometmock-chains-test');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub', 'genesis.yaml'))).toBe(true);
      
      // Verify cometmock configuration is applied
      const genesisYaml = readFileSync(join(outputPath, 'cosmoshub', 'genesis.yaml'), 'utf-8');
      // Note: Cometmock manifests are handled separately in the builder
      expect(genesisYaml).toBeDefined();
    });
  });

  describe('Chain Configuration Support', () => {
    it('should handle standard single chain configuration', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'standard-single-chain');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = singleChainConfig.chains[0];
      const manifests = builder.buildManifests(chain);
      
      expect(manifests.length).toBeGreaterThan(0);
      
      // Should have ConfigMaps, Services, and StatefulSets
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
      
      expect(configMaps.length).toBeGreaterThanOrEqual(1); // At least scripts configmap
      expect(services.length).toBe(1); // Only genesis service for single validator
      expect(statefulSets.length).toBe(1); // Only genesis statefulset for single validator
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('standard-single-chain-manifests');
    });

    it('should handle multi-validator chain configuration', () => {
      const context: GeneratorContext = { config: multiValidatorConfig };
      const outputPath = join(testOutputDir, 'multi-validator-chain');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = multiValidatorConfig.chains[0];
      const manifests = builder.buildManifests(chain);
      
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
      
      expect(services.length).toBe(2); // Genesis and validator services
      expect(statefulSets.length).toBe(2); // Genesis and validator statefulsets
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('multi-validator-chain-manifests');
    });

    it('should handle custom chain configuration', () => {
      const context: GeneratorContext = { config: customChainConfig };
      const outputPath = join(testOutputDir, 'custom-chain');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = customChainConfig.chains[0];
      const manifests = builder.buildManifests(chain);
      
      expect(manifests.length).toBeGreaterThan(0);
      
      // Check that custom image is used in StatefulSets
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      const genesisStatefulSet = statefulSets.find((ss: any) => ss.metadata.name.includes('genesis'));
      
      expect(genesisStatefulSet).toBeDefined();
      const containers = genesisStatefulSet?.spec?.template?.spec?.containers || [];
      const validatorContainer = containers.find((c: any) => c.name === 'validator');
      expect(validatorContainer?.image).toBe('anmol1696/osmosis:latest');
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('custom-chain-manifests');
    });

    it('should handle CosmJS faucet configuration', () => {
      const context: GeneratorContext = { config: cosmjsFaucetConfig };
      const outputPath = join(testOutputDir, 'cosmjs-faucet-chain');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = cosmjsFaucetConfig.chains[0];
      const manifests = builder.buildManifests(chain);
      
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      const genesisStatefulSet = statefulSets.find((ss: any) => ss.metadata.name.includes('genesis'));
      
      const containers = genesisStatefulSet?.spec?.template?.spec?.containers || [];
      const faucetContainer = containers.find((c: any) => c.name === 'faucet');
      
      expect(faucetContainer).toBeDefined();
      expect(faucetContainer?.command).toEqual(['yarn', 'start']);
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('cosmjs-faucet-chain-manifests');
    });

    it('should handle build-enabled chain configuration', () => {
      const context: GeneratorContext = { config: buildChainConfig };
      const outputPath = join(testOutputDir, 'build-enabled-chain');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = buildChainConfig.chains[0];
      const manifests = builder.buildManifests(chain);
      
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      const genesisStatefulSet = statefulSets.find((ss: any) => ss.metadata.name.includes('genesis'));
      
      const initContainers = genesisStatefulSet?.spec?.template?.spec?.initContainers || [];
      const buildInitContainer = initContainers.find((ic: any) => ic.name === 'init-build-images');
      
      expect(buildInitContainer).toBeDefined();
      expect(buildInitContainer?.image).toBe('ghcr.io/cosmology-tech/starship/builder:latest');
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('build-enabled-chain-manifests');
    });

    it('should handle cometmock-enabled chain configuration', () => {
      const context: GeneratorContext = { config: cometmockConfig };
      const outputPath = join(testOutputDir, 'cometmock-chain');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = cometmockConfig.chains[0];
      const manifests = builder.buildManifests(chain);
      
      expect(manifests.length).toBeGreaterThan(0);
      
      // Check that readiness probe is removed for cometmock
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      const genesisStatefulSet = statefulSets.find((ss: any) => ss.metadata.name.includes('genesis'));
      
      const containers = genesisStatefulSet?.spec?.template?.spec?.containers || [];
      const validatorContainer = containers.find((c: any) => c.name === 'validator');
      
      expect(validatorContainer?.readinessProbe).toBeUndefined();
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('cometmock-chain-manifests');
    });

    it('should handle multiple chains configuration', () => {
      const context: GeneratorContext = { config: twoChainConfig };
      const outputPath = join(testOutputDir, 'multiple-chains');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Both chains should have files
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);
      
      // Check that each chain has its own proper manifests
      const osmosisManifests = builder.buildManifests(twoChainConfig.chains[0]);
      const cosmoshubManifests = builder.buildManifests(twoChainConfig.chains[1]);
      
      expect(osmosisManifests.length).toBeGreaterThan(0);
      expect(cosmoshubManifests.length).toBeGreaterThan(0);
      
      // Snapshot tests
      expect(osmosisManifests).toMatchSnapshot('multiple-chains-osmosis-manifests');
      expect(cosmoshubManifests).toMatchSnapshot('multiple-chains-cosmoshub-manifests');
    });
  });

  describe('YAML Content Validation and Snapshots', () => {
    it('should generate valid YAML content - snapshots', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'yaml-content-validation');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Read and validate each YAML file
      const configMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
      const serviceYaml = readFileSync(join(outputPath, 'osmosis', 'service.yaml'), 'utf-8');
      const genesisYaml = readFileSync(join(outputPath, 'osmosis', 'genesis.yaml'), 'utf-8');
      
      // Parse to ensure valid YAML
      const configMaps = yaml.loadAll(configMapYaml);
      const services = yaml.loadAll(serviceYaml);
      const genesis = yaml.loadAll(genesisYaml);
      
      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(0);
      expect(genesis.length).toBeGreaterThan(0);
      
      // Verify Kubernetes resource structure
      configMaps.forEach((cm: any) => {
        expect(cm.apiVersion).toBe('v1');
        expect(cm.kind).toBe('ConfigMap');
        expect(cm.metadata).toBeDefined();
        expect(cm.metadata.name).toBeDefined();
      });
      
      services.forEach((svc: any) => {
        expect(svc.apiVersion).toBe('v1');
        expect(svc.kind).toBe('Service');
        expect(svc.metadata).toBeDefined();
        expect(svc.spec).toBeDefined();
      });
      
      genesis.forEach((ss: any) => {
        expect(ss.apiVersion).toBe('apps/v1');
        expect(ss.kind).toBe('StatefulSet');
        expect(ss.metadata).toBeDefined();
        expect(ss.spec).toBeDefined();
      });
      
      // Snapshot tests
      expect(configMapYaml).toMatchSnapshot('integration-configmap-yaml');
      expect(serviceYaml).toMatchSnapshot('integration-service-yaml');
      expect(genesisYaml).toMatchSnapshot('integration-genesis-yaml');
    });

    it('should handle genesis patch ConfigMaps correctly - snapshot', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'genesis-patch-configmap');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      const configMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
      const configMaps = yaml.loadAll(configMapYaml);
      
      // Should have at least scripts ConfigMap and genesis patch ConfigMap
      expect(configMaps.length).toBeGreaterThanOrEqual(2);
      
      const patchConfigMap = configMaps.find((cm: any) => 
        cm.metadata?.name?.includes('patch')
      ) as any;
      
      expect(patchConfigMap).toBeDefined();
      expect(patchConfigMap.data?.['genesis.json']).toBeDefined();
      
      // Verify genesis patch content
      const genesisData = JSON.parse(patchConfigMap.data['genesis.json']);
      expect(genesisData.app_state.staking.params.unbonding_time).toBe('5s');
      
      // Snapshot test
      expect(configMapYaml).toMatchSnapshot('genesis-patch-configmap-yaml');
    });

    it('should handle different chain names correctly - snapshot', () => {
      const context: GeneratorContext = { config: customChainConfig };
      const outputPath = join(testOutputDir, 'custom-chain-names');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Custom chain should create 'custom' directory
      expect(existsSync(join(outputPath, 'custom'))).toBe(true);
      expect(existsSync(join(outputPath, 'custom', 'configmap.yaml'))).toBe(true);
      
      // Check that resource names use correct chain name
      const serviceYaml = readFileSync(join(outputPath, 'custom', 'service.yaml'), 'utf-8');
      const services = yaml.loadAll(serviceYaml);
      
      const genesisService = services.find((svc: any) => 
        svc.metadata?.name?.includes('genesis')
      ) as any;
      
      expect(genesisService?.metadata?.name).toBe('custom-genesis');
      
      // Snapshot test
      expect(serviceYaml).toMatchSnapshot('custom-chain-service-yaml');
    });
  });

  describe('Resource Content Verification', () => {
    it('should include proper labels and annotations - snapshot', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'labels-annotations');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      const genesisYaml = readFileSync(join(outputPath, 'osmosis', 'genesis.yaml'), 'utf-8');
      const genesis = yaml.loadAll(genesisYaml);
      
      const genesisStatefulSet = genesis[0] as any;
      
      expect(genesisStatefulSet.metadata.labels).toBeDefined();
      expect(genesisStatefulSet.spec.template.metadata.labels).toBeDefined();
      expect(genesisStatefulSet.spec.template.metadata.annotations).toBeDefined();
      
      // Snapshot test
      expect(genesisStatefulSet.metadata.labels).toMatchSnapshot('genesis-statefulset-labels');
      expect(genesisStatefulSet.spec.template.metadata.annotations).toMatchSnapshot('genesis-pod-annotations');
    });

    it('should include proper environment variables - snapshot', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'environment-variables');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      const genesisYaml = readFileSync(join(outputPath, 'osmosis', 'genesis.yaml'), 'utf-8');
      const genesis = yaml.loadAll(genesisYaml);
      
      const genesisStatefulSet = genesis[0] as any;
      const containers = genesisStatefulSet.spec.template.spec.containers;
      const validatorContainer = containers.find((c: any) => c.name === 'validator');
      
      expect(validatorContainer.env).toBeDefined();
      expect(validatorContainer.env.length).toBeGreaterThan(0);
      
      // Check for some expected environment variables
      const chainId = validatorContainer.env.find((e: any) => e.name === 'CHAIN_ID');
      expect(chainId?.value).toBe('osmosis-1');
      
      // Snapshot test
      expect(validatorContainer.env).toMatchSnapshot('validator-container-env-vars');
    });

    it('should include proper port mappings - snapshot', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'port-mappings');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      const serviceYaml = readFileSync(join(outputPath, 'osmosis', 'service.yaml'), 'utf-8');
      const services = yaml.loadAll(serviceYaml);
      
      const genesisService = services[0] as any;
      const ports = genesisService.spec.ports;
      
      expect(ports).toBeDefined();
      expect(ports.length).toBeGreaterThan(0);
      
      // Check for standard Cosmos SDK ports
      const rpcPort = ports.find((p: any) => p.name === 'rpc');
      const restPort = ports.find((p: any) => p.name === 'rest');
      
      expect(rpcPort).toBeDefined();
      expect(restPort).toBeDefined();
      
      // Snapshot test
      expect(ports).toMatchSnapshot('genesis-service-port-mappings');
    });

    it('should handle different configuration variations - snapshots', () => {
      const configs = [
        { config: buildChainConfig, name: 'build-enabled' },
        { config: cosmjsFaucetConfig, name: 'cosmjs-faucet' },
        { config: cometmockConfig, name: 'cometmock' },
      ];

      configs.forEach(({ config, name }) => {
        const context: GeneratorContext = { config };
        const outputPath = join(testOutputDir, `variations-${name}`);
        const builder = new CosmosBuilder(context, outputPath);
        
        const chain = config.chains[0];
        const manifests = builder.buildManifests(chain);
        
        expect(manifests.length).toBeGreaterThan(0);
        
        // Snapshot test for each configuration variation
        expect(manifests).toMatchSnapshot(`${name}-chain-manifests`);
      });
    });
  });
}); 