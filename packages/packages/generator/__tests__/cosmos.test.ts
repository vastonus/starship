import { existsSync, mkdirSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import {
  CosmosBuilder,
  CosmosConfigMapGenerator,
  CosmosServiceGenerator,
  CosmosStatefulSetGenerator
} from '../src/cosmos';
import { ScriptManager } from '../src/scripts';
import { GeneratorContext } from '../src/types';
import {
  buildChainConfig,
  cometmockConfig,
  cosmjsFaucetConfig,
  customChainConfig,
  ethereumConfig,
  multiValidatorConfig,
  outputDir,
  singleChainConfig,
  twoChainConfig
} from './test-utils/config';

describe('Cosmos Generator Tests', () => {
  const testOutputDir = join(outputDir, 'cosmos-tests');
  let scriptManager: ScriptManager;

  beforeEach(() => {
    scriptManager = new ScriptManager();
    mkdirSync(testOutputDir, { recursive: true });
  });

  describe('Component Creation', () => {
    it('should create CosmosConfigMapGenerator', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosConfigMapGenerator(
        chain,
        singleChainConfig,
        scriptManager
      );
      expect(generator).toBeDefined();
    });

    it('should create CosmosServiceGenerator', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosServiceGenerator(chain, singleChainConfig);
      expect(generator).toBeDefined();
    });

    it('should create CosmosStatefulSetGenerator', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosStatefulSetGenerator(
        chain,
        singleChainConfig,
        scriptManager
      );
      expect(generator).toBeDefined();
    });

    it('should create CosmosBuilder', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);
      expect(builder).toBeDefined();
    });
  });

  describe('ConfigMap Generation', () => {
    it('should generate scripts ConfigMap', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosConfigMapGenerator(
        chain,
        singleChainConfig,
        scriptManager
      );

      const configMap = generator.scriptsConfigMap();

      expect(configMap.kind).toBe('ConfigMap');
      expect(configMap.metadata?.name).toBe('setup-scripts-osmosis');
      expect(configMap.data).toBeDefined();

      // Snapshot test
      expect(configMap).toMatchSnapshot('scripts-configmap');
    });

    it('should generate genesis patch ConfigMap when genesis exists', () => {
      const chain = singleChainConfig.chains[0]; // has genesis config
      const generator = new CosmosConfigMapGenerator(
        chain,
        singleChainConfig,
        scriptManager
      );

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
      const generator = new CosmosConfigMapGenerator(
        chain,
        multiValidatorConfig,
        scriptManager
      );

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
      const generator = new CosmosConfigMapGenerator(
        chain,
        icsConfig,
        scriptManager
      );

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
      const rpcPort = ports.find((p) => p.name === 'rpc');
      expect(rpcPort?.port).toBe(26657);

      const restPort = ports.find((p) => p.name === 'rest');
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

      const metricsPort = service.spec?.ports?.find(
        (p) => p.name === 'metrics'
      );
      expect(metricsPort).toBeDefined();
      expect(metricsPort?.port).toBe(26660);

      // Snapshot test
      expect(service).toMatchSnapshot('genesis-service-with-metrics');
    });

    it('should handle different chain configurations', () => {
      // Test custom chain
      const customChain = customChainConfig.chains[0];
      const customGenerator = new CosmosServiceGenerator(
        customChain,
        customChainConfig
      );
      const customService = customGenerator.genesisService();
      expect(customService.metadata?.name).toBe('custom-genesis');
      expect(customService).toMatchSnapshot('custom-chain-service');

      // Test build-enabled chain
      const buildChain = buildChainConfig.chains[0];
      const buildGenerator = new CosmosServiceGenerator(
        buildChain,
        buildChainConfig
      );
      const buildService = buildGenerator.genesisService();
      expect(buildService.metadata?.name).toBe('persistencecore-genesis');
      expect(buildService).toMatchSnapshot('build-enabled-chain-service');
    });

    it('should handle different faucet configurations', () => {
      // Test starship faucet
      const starshipChain = singleChainConfig.chains[0];
      const starshipGenerator = new CosmosServiceGenerator(
        starshipChain,
        singleChainConfig
      );
      const starshipService = starshipGenerator.genesisService();
      expect(starshipService).toBeDefined();
      expect(starshipService).toMatchSnapshot('starship-faucet-service');

      // Test cosmjs faucet
      const cosmjsChain = cosmjsFaucetConfig.chains[0];
      const cosmjsGenerator = new CosmosServiceGenerator(
        cosmjsChain,
        cosmjsFaucetConfig
      );
      const cosmjsService = cosmjsGenerator.genesisService();
      expect(cosmjsService).toBeDefined();
      expect(cosmjsService).toMatchSnapshot('cosmjs-faucet-service');
    });
  });

  describe('StatefulSet Generation', () => {
    it('should generate genesis StatefulSet', () => {
      const chain = singleChainConfig.chains[0];
      const generator = new CosmosStatefulSetGenerator(
        chain,
        singleChainConfig,
        scriptManager
      );

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
      const generator = new CosmosStatefulSetGenerator(
        chain,
        multiValidatorConfig,
        scriptManager
      );

      const statefulSet = generator.validatorStatefulSet();

      expect(statefulSet.kind).toBe('StatefulSet');
      expect(statefulSet.metadata?.name).toBe('osmosis-validator');
      expect(statefulSet.spec?.replicas).toBe(1); // numValidators - 1

      // Snapshot test
      expect(statefulSet).toMatchSnapshot('validator-statefulset');
    });

    it('should include build init container when build enabled', () => {
      const chain = buildChainConfig.chains[0]; // has build.enabled: true
      const generator = new CosmosStatefulSetGenerator(
        chain,
        buildChainConfig,
        scriptManager
      );

      const statefulSet = generator.genesisStatefulSet();

      const buildInitContainer =
        statefulSet.spec?.template.spec?.initContainers?.find(
          (ic) => ic.name === 'init-build-images'
        );
      expect(buildInitContainer).toBeDefined();
      expect(buildInitContainer?.image).toBe(
        'ghcr.io/cosmology-tech/starship/builder:latest'
      );

      // Snapshot test
      expect(statefulSet).toMatchSnapshot('build-enabled-genesis-statefulset');
    });

    it('should handle different faucet types in containers', () => {
      // Test starship faucet
      const starshipChain = singleChainConfig.chains[0];
      const starshipGenerator = new CosmosStatefulSetGenerator(
        starshipChain,
        singleChainConfig,
        scriptManager
      );
      const starshipStatefulSet = starshipGenerator.genesisStatefulSet();

      const starshipContainers =
        starshipStatefulSet.spec?.template.spec?.containers || [];
      const starshipFaucetContainer = starshipContainers.find(
        (c) => c.name === 'faucet'
      );
      expect(starshipFaucetContainer).toBeDefined();

      // Test cosmjs faucet
      const cosmjsChain = cosmjsFaucetConfig.chains[0];
      const cosmjsGenerator = new CosmosStatefulSetGenerator(
        cosmjsChain,
        cosmjsFaucetConfig,
        scriptManager
      );
      const cosmjsStatefulSet = cosmjsGenerator.genesisStatefulSet();

      const cosmjsContainers =
        cosmjsStatefulSet.spec?.template.spec?.containers || [];
      const cosmjsFaucetContainer = cosmjsContainers.find(
        (c) => c.name === 'faucet'
      );
      expect(cosmjsFaucetContainer).toBeDefined();

      // Snapshot tests
      expect(starshipStatefulSet).toMatchSnapshot(
        'starship-faucet-statefulset'
      );
      expect(cosmjsStatefulSet).toMatchSnapshot('cosmjs-faucet-statefulset');
    });

    it('should handle cometmock configuration', () => {
      const chain = cometmockConfig.chains[0];
      const generator = new CosmosStatefulSetGenerator(
        chain,
        cometmockConfig,
        scriptManager
      );

      const statefulSet = generator.genesisStatefulSet();

      // Check that readiness probe is removed for cometmock
      const containers = statefulSet.spec?.template.spec?.containers || [];
      const validatorContainer = containers.find(
        (c) => c.name === 'validator'
      );

      expect(validatorContainer?.readinessProbe).toBeUndefined();

      // Snapshot test
      expect(statefulSet).toMatchSnapshot('cometmock-genesis-statefulset');
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
      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );

      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBe(1); // Only genesis service for single validator
      expect(statefulSets.length).toBe(1); // Only genesis statefulset for single validator

      // Snapshot test
      expect(manifests).toMatchSnapshot('single-chain-all-manifests');
    });

    it('should build all manifests for a multi-validator chain', () => {
      const context: GeneratorContext = { config: multiValidatorConfig };
      const builder = new CosmosBuilder(context);
      const chain = multiValidatorConfig.chains[0];

      const manifests = builder.buildManifests(chain);

      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );

      expect(services.length).toBe(2); // Genesis and validator services
      expect(statefulSets.length).toBe(2); // Genesis and validator statefulsets

      // Snapshot test
      expect(manifests).toMatchSnapshot('multi-validator-chain-all-manifests');
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
    it('should generate files using constructor outputDir', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'constructor-outputdir');
      const builder = new CosmosBuilder(context, outputPath);

      const chain = singleChainConfig.chains[0];
      builder.generateFiles(chain);

      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(
        false
      );
    });

    it('should generate files using method outputDir parameter', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);

      const chain = singleChainConfig.chains[0];
      const methodOutputDir = join(testOutputDir, 'method-outputdir');
      builder.generateFiles(chain, methodOutputDir);

      expect(existsSync(join(methodOutputDir, 'osmosis'))).toBe(true);
      expect(
        existsSync(join(methodOutputDir, 'osmosis', 'configmap.yaml'))
      ).toBe(true);
      expect(existsSync(join(methodOutputDir, 'osmosis', 'service.yaml'))).toBe(
        true
      );
      expect(existsSync(join(methodOutputDir, 'osmosis', 'genesis.yaml'))).toBe(
        true
      );
    });

    it('should throw error when no output directory provided', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);

      const chain = singleChainConfig.chains[0];

      expect(() => {
        builder.generateFiles(chain);
      }).toThrow(
        'Output directory must be provided either in constructor or method call'
      );
    });

    it('should generate files for single vs multi-validator chains', () => {
      // Single validator chain
      const singleContext: GeneratorContext = { config: singleChainConfig };
      const singleBuilder = new CosmosBuilder(singleContext);
      const singleOutputDir = join(testOutputDir, 'single-validator-test');
      singleBuilder.generateFiles(singleChainConfig.chains[0], singleOutputDir);

      // Multi validator chain
      const multiContext: GeneratorContext = { config: multiValidatorConfig };
      const multiOutputDir = join(testOutputDir, 'multi-validator-test');
      const multiBuilder = new CosmosBuilder(multiContext);
      multiBuilder.generateFiles(
        multiValidatorConfig.chains[0],
        multiOutputDir
      );

      // Single validator should not have validator.yaml
      expect(
        existsSync(join(singleOutputDir, 'osmosis', 'validator.yaml'))
      ).toBe(false);

      // Multi validator should have validator.yaml
      expect(
        existsSync(join(multiOutputDir, 'osmosis', 'validator.yaml'))
      ).toBe(true);
    });

    it('should generate all files for multiple chains', () => {
      const context: GeneratorContext = { config: twoChainConfig };
      const outputPath = join(testOutputDir, 'multiple-chains');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Both chains should have directories
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);

      // Both should have basic files
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'cosmoshub', 'configmap.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'cosmoshub', 'service.yaml'))).toBe(
        true
      );

      // Both have numValidators: 2, so both should have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'cosmoshub', 'validator.yaml'))).toBe(
        true
      );
    });
  });

  describe('YAML Content Generation', () => {
    it('should generate valid YAML content', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'yaml-content-validation');
      const builder = new CosmosBuilder(context, outputPath);

      const chain = singleChainConfig.chains[0];
      builder.generateFiles(chain);

      // Read and parse YAML files
      const configMapYaml = readFileSync(
        join(outputPath, 'osmosis', 'configmap.yaml'),
        'utf-8'
      );
      const serviceYaml = readFileSync(
        join(outputPath, 'osmosis', 'service.yaml'),
        'utf-8'
      );
      const genesisYaml = readFileSync(
        join(outputPath, 'osmosis', 'genesis.yaml'),
        'utf-8'
      );

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

    it('should generate valid multi-validator YAML content', () => {
      const context: GeneratorContext = { config: multiValidatorConfig };
      const outputPath = join(testOutputDir, 'multi-validator-yaml');
      const builder = new CosmosBuilder(context, outputPath);

      const chain = multiValidatorConfig.chains[0];
      builder.generateFiles(chain);

      // Read YAML files
      const configMapYaml = readFileSync(
        join(outputPath, 'osmosis', 'configmap.yaml'),
        'utf-8'
      );
      const serviceYaml = readFileSync(
        join(outputPath, 'osmosis', 'service.yaml'),
        'utf-8'
      );
      const genesisYaml = readFileSync(
        join(outputPath, 'osmosis', 'genesis.yaml'),
        'utf-8'
      );
      const validatorYaml = readFileSync(
        join(outputPath, 'osmosis', 'validator.yaml'),
        'utf-8'
      );

      // Manual checks
      expect(configMapYaml).toBeDefined();
      expect(serviceYaml).toBeDefined();
      expect(genesisYaml).toBeDefined();
      expect(validatorYaml).toBeDefined();

      // Snapshot tests
      expect(configMapYaml).toMatchSnapshot('multi-validator-configmap-yaml');
      expect(serviceYaml).toMatchSnapshot('multi-validator-service-yaml');
      expect(genesisYaml).toMatchSnapshot('multi-validator-genesis-yaml');
      expect(validatorYaml).toMatchSnapshot('multi-validator-validator-yaml');
    });

    it('should generate YAML for different chain configurations', () => {
      // Custom chain
      const customContext: GeneratorContext = { config: customChainConfig };
      const customOutputPath = join(testOutputDir, 'custom-chain-yaml');
      const customBuilder = new CosmosBuilder(customContext, customOutputPath);
      customBuilder.generateAllFiles();

      expect(existsSync(join(customOutputPath, 'custom'))).toBe(true);

      const customConfigMapYaml = readFileSync(
        join(customOutputPath, 'custom', 'configmap.yaml'),
        'utf-8'
      );
      const customServiceYaml = readFileSync(
        join(customOutputPath, 'custom', 'service.yaml'),
        'utf-8'
      );
      const customGenesisYaml = readFileSync(
        join(customOutputPath, 'custom', 'genesis.yaml'),
        'utf-8'
      );

      expect(customConfigMapYaml).toMatchSnapshot('custom-chain-configmap-yaml');
      expect(customServiceYaml).toMatchSnapshot('custom-chain-service-yaml');
      expect(customGenesisYaml).toMatchSnapshot('custom-chain-genesis-yaml');

      // Build-enabled chain
      const buildContext: GeneratorContext = { config: buildChainConfig };
      const buildOutputPath = join(testOutputDir, 'build-enabled-yaml');
      const buildBuilder = new CosmosBuilder(buildContext, buildOutputPath);
      buildBuilder.generateAllFiles();

      expect(existsSync(join(buildOutputPath, 'persistencecore'))).toBe(true);

      const buildGenesisYaml = readFileSync(
        join(buildOutputPath, 'persistencecore', 'genesis.yaml'),
        'utf-8'
      );

      // Should contain build-related content
      expect(buildGenesisYaml).toContain('init-build-images');
      expect(buildGenesisYaml).toContain(
        'ghcr.io/cosmology-tech/starship/builder:latest'
      );

      expect(buildGenesisYaml).toMatchSnapshot('build-enabled-chain-genesis-yaml');
    });

    it('should generate YAML for multiple chains with snapshots', () => {
      const context: GeneratorContext = { config: twoChainConfig };
      const outputPath = join(testOutputDir, 'two-chain-yaml-snapshots');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Read osmosis files
      const osmosisConfigMapYaml = readFileSync(
        join(outputPath, 'osmosis', 'configmap.yaml'),
        'utf-8'
      );
      const osmosisServiceYaml = readFileSync(
        join(outputPath, 'osmosis', 'service.yaml'),
        'utf-8'
      );

      // Read cosmoshub files
      const cosmoshubConfigMapYaml = readFileSync(
        join(outputPath, 'cosmoshub', 'configmap.yaml'),
        'utf-8'
      );
      const cosmoshubServiceYaml = readFileSync(
        join(outputPath, 'cosmoshub', 'service.yaml'),
        'utf-8'
      );

      // Manual checks
      expect(osmosisConfigMapYaml).toBeDefined();
      expect(cosmoshubConfigMapYaml).toBeDefined();

      // Snapshot tests
      expect(osmosisConfigMapYaml).toMatchSnapshot(
        'two-chain-osmosis-configmap-yaml'
      );
      expect(osmosisServiceYaml).toMatchSnapshot(
        'two-chain-osmosis-service-yaml'
      );
      expect(cosmoshubConfigMapYaml).toMatchSnapshot(
        'two-chain-cosmoshub-configmap-yaml'
      );
      expect(cosmoshubServiceYaml).toMatchSnapshot(
        'two-chain-cosmoshub-service-yaml'
      );
    });
  });
});
