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

describe('Cosmos Generator Tests', () => {
  const testOutputDir = join(outputDir, 'cosmos-tests');
  let scriptManager: ScriptManager;

  beforeEach(() => {
    scriptManager = new ScriptManager();
    mkdirSync(testOutputDir, { recursive: true });
  });

  describe('ConfigMap Generation', () => {
    it('should generate scripts ConfigMap', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosConfigMapGenerator(chain, singleChainConfig, scriptManager);
      
      const configMap = generator.scriptsConfigMap();
      
      expect(configMap.kind).toBe('ConfigMap');
      expect(configMap.metadata?.name).toBe('setup-scripts-osmosis');
      expect(configMap.data).toBeDefined();
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('scripts-configmap');
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
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('genesis-patch-configmap');
    });

    it('should return null for genesis patch when no genesis', () => {
      const chain = multiValidatorConfig.chains[0]; // no genesis config
      const generator = new CosmosConfigMapGenerator(chain, multiValidatorConfig, scriptManager);
      
      const configMap = generator.genesisPatchConfigMap();
      
      expect(configMap).toBeNull();
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('null-genesis-patch-configmap');
    });

    it('should generate ICS consumer proposal ConfigMap when ICS enabled', () => {
      // Create a config with ICS enabled
      const icsConfig = {
        ...singleChainConfig,
        chains: [
          {
            ...singleChainConfig.chains[0],
            ics: {
              enabled: true,
              provider: 'cosmoshub-4'
            }
          },
          {
            id: 'cosmoshub-4',
            name: 'cosmoshub' as const,
            denom: 'uatom',
            prefix: 'cosmos',
            binary: 'gaiad',
            image: 'cosmoshub:latest',
            home: '/root/.gaia',
            numValidators: 1
          }
        ]
      };

      const chain = icsConfig.chains[0];
      const generator = new CosmosConfigMapGenerator(chain, icsConfig, scriptManager);
      
      const configMap = generator.icsConsumerProposalConfigMap();
      
      expect(configMap).not.toBeNull();
      expect(configMap?.kind).toBe('ConfigMap');
      expect(configMap?.metadata?.name).toBe('consumer-proposal-osmosis');
      
      const proposalJsonString = configMap?.data?.['proposal.json'] as string;
      const proposalData = JSON.parse(proposalJsonString || '{}');
      expect(proposalData.chain_id).toBe('osmosis-1');
      expect(proposalData.title).toContain('osmosis');
      
      // Snapshot test
      expect(configMap).toMatchSnapshot('ics-consumer-proposal-configmap');
    });
  });

  describe('Service Generation', () => {
    it('should generate genesis service', () => {
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
      
      // Snapshot test
      expect(service).toMatchSnapshot('genesis-service');
    });

    it('should generate validator service', () => {
      const chain = multiValidatorConfig.chains[0];
      const generator = new CosmosServiceGenerator(chain, multiValidatorConfig);
      
      const service = generator.validatorService();
      
      expect(service.kind).toBe('Service');
      expect(service.metadata?.name).toBe('osmosis-validator');
      expect(service.spec?.clusterIP).toBe('None');
      
      // Snapshot test
      expect(service).toMatchSnapshot('validator-service');
    });

    it('should include metrics port when metrics enabled', () => {
      const chain = singleChainConfig.chains[0]; // has metrics: true
      const generator = new CosmosServiceGenerator(chain, singleChainConfig);
      
      const service = generator.genesisService();
      
      const metricsPort = service.spec?.ports?.find(p => p.name === 'metrics');
      expect(metricsPort).toBeDefined();
      expect(metricsPort?.port).toBe(26660);
      
      // Snapshot test
      expect(service).toMatchSnapshot('genesis-service-with-metrics');
    });
  });

  describe('StatefulSet Generation', () => {
    it('should generate genesis StatefulSet', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosStatefulSetGenerator(chain, singleChainConfig, scriptManager);
      
      const statefulSet = generator.genesisStatefulSet();
      
      expect(statefulSet.kind).toBe('StatefulSet');
      expect(statefulSet.metadata?.name).toBe('osmosis-genesis');
      expect(statefulSet.spec?.replicas).toBe(1);
      expect(statefulSet.spec?.template.spec?.initContainers).toBeDefined();
      expect(statefulSet.spec?.template.spec?.containers).toBeDefined();
      
      // Snapshot test
      expect(statefulSet).toMatchSnapshot('genesis-statefulset');
    });

    it('should generate validator StatefulSet', () => {
      const chain = multiValidatorConfig.chains[0]; // numValidators: 2
      const generator = new CosmosStatefulSetGenerator(chain, multiValidatorConfig, scriptManager);
      
      const statefulSet = generator.validatorStatefulSet();
      
      expect(statefulSet.kind).toBe('StatefulSet');
      expect(statefulSet.metadata?.name).toBe('osmosis-validator');
      expect(statefulSet.spec?.replicas).toBe(1); // numValidators - 1
      
      // Snapshot test
      expect(statefulSet).toMatchSnapshot('validator-statefulset');
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
      
      // Snapshot test
      expect(statefulSet).toMatchSnapshot('build-enabled-genesis-statefulset');
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
      
      // Snapshot tests
      expect(starshipStatefulSet).toMatchSnapshot('starship-faucet-statefulset');
      expect(cosmjsStatefulSet).toMatchSnapshot('cosmjs-faucet-statefulset');
    });
  });

  describe('Builder Integration', () => {
    it('should build all manifests for a chain', () => {
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
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('single-chain-all-manifests');
    });

    it('should skip Ethereum chains', () => {
      const context: GeneratorContext = { config: ethereumConfig };
      const builder = new CosmosBuilder(context);
      const chain = ethereumConfig.chains[0];
      
      const manifests = builder.buildManifests(chain);
      
      expect(manifests.length).toBe(0);
      
      // Snapshot test
      expect(manifests).toMatchSnapshot('ethereum-chain-empty-manifests');
    });
  });

  describe('File Generation', () => {
    it('should generate files for single chain', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'single-chain-file-generation');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = singleChainConfig.chains[0];
      builder.generateFiles(chain);
      
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
      
      // Single validator should not have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(false);
    });

    it('should generate files for multi-validator chain', () => {
      const context: GeneratorContext = { config: multiValidatorConfig };
      const outputPath = join(testOutputDir, 'multi-validator-file-generation');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = multiValidatorConfig.chains[0];
      builder.generateFiles(chain);
      
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
      
      // Multi-validator should have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(true);
    });

    describe('YAML Content Generation Snapshots', () => {
      it('should generate valid YAML content - snapshots', () => {
        const context: GeneratorContext = { config: singleChainConfig };
        const outputPath = join(testOutputDir, 'valid-yaml-content-test');
        const builder = new CosmosBuilder(context, outputPath);
        
        const chain = singleChainConfig.chains[0];
        builder.generateFiles(chain);
        
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
        
        // Snapshot tests
        expect(configMapYaml).toMatchSnapshot('generated-configmap-yaml');
        expect(serviceYaml).toMatchSnapshot('generated-service-yaml');
        expect(genesisYaml).toMatchSnapshot('generated-genesis-yaml');
      });

      it('should generate all files for multiple chains - snapshots', () => {
        const context: GeneratorContext = { config: twoChainConfig };
        const outputPath = join(testOutputDir, 'multiple-chains-all-files');
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
        
        // Read and snapshot test the generated YAML files
        const osmosisConfigMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
        const cosmoshubConfigMapYaml = readFileSync(join(outputPath, 'cosmoshub', 'configmap.yaml'), 'utf-8');
        
        expect(osmosisConfigMapYaml).toMatchSnapshot('multiple-chains-osmosis-configmap-yaml');
        expect(cosmoshubConfigMapYaml).toMatchSnapshot('multiple-chains-cosmoshub-configmap-yaml');
      });

      it('should handle custom chain YAML generation - snapshots', () => {
        const context: GeneratorContext = { config: customChainConfig };
        const outputPath = join(testOutputDir, 'custom-chain-yaml-generation');
        const builder = new CosmosBuilder(context, outputPath);
        
        builder.generateAllFiles();
        
        expect(existsSync(join(outputPath, 'custom'))).toBe(true);
        
        const configMapYaml = readFileSync(join(outputPath, 'custom', 'configmap.yaml'), 'utf-8');
        const serviceYaml = readFileSync(join(outputPath, 'custom', 'service.yaml'), 'utf-8');
        const genesisYaml = readFileSync(join(outputPath, 'custom', 'genesis.yaml'), 'utf-8');
        
        expect(configMapYaml).toMatchSnapshot('custom-chain-configmap-yaml');
        expect(serviceYaml).toMatchSnapshot('custom-chain-service-yaml');
        expect(genesisYaml).toMatchSnapshot('custom-chain-genesis-yaml');
      });

      it('should handle build-enabled chain YAML generation - snapshots', () => {
        const context: GeneratorContext = { config: buildChainConfig };
        const outputPath = join(testOutputDir, 'build-chain-yaml-generation');
        const builder = new CosmosBuilder(context, outputPath);
        
        builder.generateAllFiles();
        
        expect(existsSync(join(outputPath, 'persistencecore'))).toBe(true);
        
        const genesisYaml = readFileSync(join(outputPath, 'persistencecore', 'genesis.yaml'), 'utf-8');
        
        // Should contain build-related content
        expect(genesisYaml).toContain('init-build-images');
        expect(genesisYaml).toContain('ghcr.io/cosmology-tech/starship/builder:latest');
        
        expect(genesisYaml).toMatchSnapshot('build-enabled-chain-genesis-yaml');
      });
    });
  });
});
 