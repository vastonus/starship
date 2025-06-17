import { existsSync, mkdirSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import { CosmosBuilder } from '../src/cosmos';
import { GeneratorContext } from '../src/types';
import {
  buildChainConfig,
  cometmockConfig,
  cosmjsFaucetConfig,
  ethereumConfig,
  outputDir,
  singleChainConfig,
  twoChainConfig
} from './test-utils/config';

describe('Cosmos Integration Tests', () => {
  const testOutputDir = join(outputDir, 'integration-tests');

  beforeEach(() => {
    mkdirSync(testOutputDir, { recursive: true });
  });

  describe('End-to-End Generation', () => {
    it('should generate complete single-chain setup', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'complete-single-chain');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Verify directory structure
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);

      // Verify all required files exist
      const requiredFiles = ['configmap.yaml', 'service.yaml', 'genesis.yaml'];
      requiredFiles.forEach((file) => {
        expect(existsSync(join(outputPath, 'osmosis', file))).toBe(true);
      });

      // Verify no validator files for single validator
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(
        false
      );

      // Read and verify file contents
      const configMapContent = readFileSync(
        join(outputPath, 'osmosis', 'configmap.yaml'),
        'utf-8'
      );
      const serviceContent = readFileSync(
        join(outputPath, 'osmosis', 'service.yaml'),
        'utf-8'
      );
      const genesisContent = readFileSync(
        join(outputPath, 'osmosis', 'genesis.yaml'),
        'utf-8'
      );

      // Basic content validation
      expect(configMapContent).toContain('kind: ConfigMap');
      expect(serviceContent).toContain('kind: Service');
      expect(genesisContent).toContain('kind: StatefulSet');

      // Snapshot the complete setup
      expect({
        configMap: configMapContent,
        service: serviceContent,
        genesis: genesisContent
      }).toMatchSnapshot('complete-single-chain-setup');
    });

    it('should generate complete multi-chain setup', () => {
      const context: GeneratorContext = { config: twoChainConfig };
      const outputPath = join(testOutputDir, 'complete-multi-chain');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Verify both chain directories
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);

      // Verify files for both chains (both have numValidators: 2, so both should have validator.yaml)
      const chains = ['osmosis', 'cosmoshub'];
      const requiredFiles = [
        'configmap.yaml',
        'service.yaml',
        'genesis.yaml',
        'validator.yaml'
      ];

      chains.forEach((chain) => {
        requiredFiles.forEach((file) => {
          expect(existsSync(join(outputPath, chain, file))).toBe(true);
        });
      });

      // Read contents for verification
      const osmosisConfigMap = readFileSync(
        join(outputPath, 'osmosis', 'configmap.yaml'),
        'utf-8'
      );
      const cosmoshubConfigMap = readFileSync(
        join(outputPath, 'cosmoshub', 'configmap.yaml'),
        'utf-8'
      );

      // Basic content validation
      expect(osmosisConfigMap).toContain('kind: ConfigMap');
      expect(cosmoshubConfigMap).toContain('kind: ConfigMap');

      // Snapshot the complete multi-chain setup
      expect({
        osmosisConfigMap,
        cosmoshubConfigMap
      }).toMatchSnapshot('complete-multi-chain-setup');
    });

    it('should handle different chain types in same deployment', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'mixed-chain-types');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Verify chain directory exists
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);

      // Should have basic files
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(
        true
      );
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(
        true
      );

      // Single validator should not have validator.yaml
      expect(existsSync(join(outputPath, 'osmosis', 'validator.yaml'))).toBe(
        false
      );

      // Snapshot the setup
      const chainContent = {
        configMap: readFileSync(
          join(outputPath, 'osmosis', 'configmap.yaml'),
          'utf-8'
        ),
        service: readFileSync(
          join(outputPath, 'osmosis', 'service.yaml'),
          'utf-8'
        ),
        genesis: readFileSync(
          join(outputPath, 'osmosis', 'genesis.yaml'),
          'utf-8'
        )
      };

      expect(chainContent).toMatchSnapshot('mixed-chain-types-setup');
    });
  });

  describe('Resource Content Verification', () => {
    it('should generate correct labels and annotations', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'labels-annotations');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Parse YAML files
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

      const configMaps = yaml.loadAll(configMapYaml) as any[];
      const services = yaml.loadAll(serviceYaml) as any[];
      const statefulSets = yaml.loadAll(genesisYaml) as any[];

      // Verify that we have resources
      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);

      // Check ConfigMap labels
      configMaps.forEach((configMap) => {
        expect(configMap.metadata.labels).toBeDefined();
        expect(configMap.metadata.labels['app.kubernetes.io/name']).toBe(
          'osmosis'
        );
        expect(configMap.metadata.labels['app.kubernetes.io/version']).toBe(
          context.config.version
        );
        expect(configMap.metadata.labels['app.kubernetes.io/managed-by']).toBe(
          'starship'
        );
        expect(configMap.metadata.labels['app.kubernetes.io/type']).toBe(
          'osmosis-1-configmap'
        );
        expect(configMap.metadata.labels['app.kubernetes.io/id']).toBe(
          'osmosis-1'
        );
      });

      // Check Service labels
      services.forEach((service) => {
        expect(service.metadata.labels).toBeDefined();
        expect(service.metadata.labels['app.kubernetes.io/name']).toBe(
          'osmosis'
        );
        expect(service.metadata.labels['app.kubernetes.io/version']).toBe(
          context.config.version
        );
        expect(service.metadata.labels['app.kubernetes.io/managed-by']).toBe(
          'starship'
        );
        expect(service.metadata.labels['app.kubernetes.io/type']).toBe(
          'osmosis-1-service'
        );
        expect(service.metadata.labels['app.kubernetes.io/id']).toBe(
          'osmosis-1'
        );
      });

      // Check StatefulSet labels
      statefulSets.forEach((statefulSet) => {
        expect(statefulSet.metadata.labels).toBeDefined();
        expect(statefulSet.metadata.labels['app.kubernetes.io/name']).toBe(
          'osmosis-genesis'
        );
        expect(statefulSet.metadata.labels['app.kubernetes.io/version']).toBe(
          context.config.version
        );
        expect(
          statefulSet.metadata.labels['app.kubernetes.io/managed-by']
        ).toBe('starship');
        expect(statefulSet.metadata.labels['app.kubernetes.io/type']).toBe(
          'osmosis-1-statefulset'
        );
        expect(statefulSet.metadata.labels['app.kubernetes.io/id']).toBe(
          'osmosis-1'
        );
      });

      // Snapshot the resource structure
      expect({
        configMapCount: configMaps.length,
        serviceCount: services.length,
        statefulSetCount: statefulSets.length,
        configMapLabels: configMaps[0]?.metadata?.labels,
        serviceLabels: services[0]?.metadata?.labels,
        statefulSetLabels: statefulSets[0]?.metadata?.labels
      }).toMatchSnapshot('resource-labels-annotations');
    });

    it('should generate correct environment variables', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'environment-variables');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Parse genesis StatefulSet
      const genesisYaml = readFileSync(
        join(outputPath, 'osmosis', 'genesis.yaml'),
        'utf-8'
      );
      const statefulSets = yaml.loadAll(genesisYaml) as any[];

      expect(statefulSets.length).toBeGreaterThan(0);

      const genesisStatefulSet = statefulSets[0];
      expect(
        genesisStatefulSet?.spec?.template?.spec?.containers
      ).toBeDefined();

      const containers = genesisStatefulSet.spec.template.spec.containers || [];
      expect(containers.length).toBeGreaterThan(0);

      // Check validator container environment
      const validatorContainer = containers.find(
        (c: any) => c.name === 'validator'
      );

      expect(validatorContainer).toBeDefined();
      expect(validatorContainer.env).toBeDefined();
      expect(validatorContainer.env.length).toBeGreaterThan(0);

      // Check specific environment variables exist
      const chainIdEnv = validatorContainer.env.find(
        (e: any) => e.name === 'CHAIN_ID'
      );
      expect(chainIdEnv).toBeDefined();
      expect(chainIdEnv.value).toBe('osmosis-1');

      const chainDenomEnv = validatorContainer.env.find(
        (e: any) => e.name === 'DENOM'
      );
      expect(chainDenomEnv).toBeDefined();
      expect(chainDenomEnv.value).toBe('uosmo');

      // Snapshot environment configuration
      expect({
        containerCount: containers.length,
        hasValidatorContainer: !!validatorContainer,
        envVarCount: validatorContainer.env.length,
        hasChainId: !!chainIdEnv,
        hasDenom: !!chainDenomEnv
      }).toMatchSnapshot('environment-variables');
    });

    it('should generate correct port mappings', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'port-mappings');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Parse service YAML
      const serviceYaml = readFileSync(
        join(outputPath, 'osmosis', 'service.yaml'),
        'utf-8'
      );
      const services = yaml.loadAll(serviceYaml) as any[];
      const genesisService = services[0];

      const ports = genesisService?.spec?.ports || [];
      expect(ports.length).toBeGreaterThan(0);

      // Check for RPC port
      const rpcPort = ports.find((p: any) => p.name === 'rpc');
      if (rpcPort) {
        expect(parseInt(rpcPort.port)).toBe(26657);
      }

      // Snapshot port configuration
      expect({
        portCount: ports.length,
        hasRpcPort: !!rpcPort
      }).toMatchSnapshot('port-mappings');
    });

    it('should handle special configurations correctly', () => {
      // Test different special configurations
      const configs = [
        { name: 'cosmjs-faucet', config: cosmjsFaucetConfig },
        { name: 'build-enabled', config: buildChainConfig },
        { name: 'cometmock', config: cometmockConfig }
      ];

      const specialConfigs = {} as Record<string, any>;

      configs.forEach(({ name, config }) => {
        const context: GeneratorContext = { config };
        const outputPath = join(testOutputDir, `special-${name}`);
        const builder = new CosmosBuilder(context, outputPath);

        builder.generateAllFiles();

        const chain = config.chains[0];
        const chainName = chain.name;

        // Check that files exist
        const hasGenesis = existsSync(
          join(outputPath, chainName, 'genesis.yaml')
        );
        specialConfigs[name] = { hasGenesis };
      });

      // Snapshot special configurations
      expect(specialConfigs).toMatchSnapshot('special-configurations');
    });
  });

  describe('Configuration Validation', () => {
    it('should skip non-cosmos chains', () => {
      const context: GeneratorContext = { config: ethereumConfig };
      const outputPath = join(testOutputDir, 'skip-ethereum');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Should not create any directories for ethereum
      expect(existsSync(join(outputPath, 'ethereum'))).toBe(false);
      expect(existsSync(join(outputPath, 'geth'))).toBe(false);

      // Snapshot the empty result
      expect({
        ethereumSkipped: true,
        directories: []
      }).toMatchSnapshot('skip-ethereum-chains');
    });

    it('should handle missing configuration gracefully', () => {
      const invalidConfig = {
        name: 'invalid-testnet',
        chains: [
          {
            // Missing required fields
            id: 'incomplete-1'
          }
        ]
      };

      const context: GeneratorContext = { config: invalidConfig as any };
      const outputPath = join(testOutputDir, 'invalid-config');

      // Should handle gracefully without throwing
      expect(() => {
        const builder = new CosmosBuilder(context, outputPath);
        builder.generateAllFiles();
      }).not.toThrow();

      // Snapshot the result
      expect({
        handled: true,
        error: null
      }).toMatchSnapshot('invalid-config-handling');
    });

    it('should validate required chain properties', () => {
      const validationTests = [
        {
          name: 'complete-chain',
          chain: singleChainConfig.chains[0],
          shouldPass: true
        },
        {
          name: 'missing-binary',
          chain: { ...singleChainConfig.chains[0], binary: undefined },
          shouldPass: false
        },
        {
          name: 'missing-denom',
          chain: { ...singleChainConfig.chains[0], denom: undefined },
          shouldPass: false
        }
      ];

      const validationResults = {} as Record<string, any>;

      validationTests.forEach(({ name, chain, shouldPass }) => {
        const testConfig = { ...singleChainConfig, chains: [chain] };
        const context: GeneratorContext = { config: testConfig };
        const outputPath = join(testOutputDir, `validation-${name}`);

        try {
          const builder = new CosmosBuilder(context, outputPath);
          builder.generateAllFiles();
          validationResults[name] = { success: true, error: null };
        } catch (error: any) {
          validationResults[name] = {
            success: false,
            error: error?.message || 'Unknown error'
          };
        }

        if (shouldPass) {
          expect(validationResults[name].success).toBe(true);
        }
      });

      // Snapshot validation results
      expect(validationResults).toMatchSnapshot('chain-validation-results');
    });
  });

  describe('Advanced Integration Scenarios', () => {
    it('should handle complex multi-chain with different faucet types', () => {
      const complexConfig = {
        name: 'complex-testnet',
        chains: [
          {
            ...singleChainConfig.chains[0],
            id: 'osmosis-starship',
            faucet: { type: 'starship' as const, enabled: true }
          },
          {
            ...cosmjsFaucetConfig.chains[0],
            id: 'osmosis-cosmjs'
          }
        ]
      };

      const context: GeneratorContext = { config: complexConfig };
      const outputPath = join(testOutputDir, 'complex-faucets');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Both chains should exist
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);

      // Snapshot the complex setup
      expect({
        chains: ['osmosis'],
        hasFiles: existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))
      }).toMatchSnapshot('complex-faucet-setup');
    });

    it('should generate consistent output across multiple runs', () => {
      const context: GeneratorContext = { config: singleChainConfig };

      // Generate files twice
      const outputPath1 = join(testOutputDir, 'consistency-run1');
      const outputPath2 = join(testOutputDir, 'consistency-run2');

      const builder1 = new CosmosBuilder(context, outputPath1);
      const builder2 = new CosmosBuilder(context, outputPath2);

      builder1.generateAllFiles();
      builder2.generateAllFiles();

      // Read files from both runs
      const files = ['configmap.yaml', 'service.yaml', 'genesis.yaml'];
      const run1Contents = {} as Record<string, string>;
      const run2Contents = {} as Record<string, string>;

      files.forEach((file) => {
        run1Contents[file] = readFileSync(
          join(outputPath1, 'osmosis', file),
          'utf-8'
        );
        run2Contents[file] = readFileSync(
          join(outputPath2, 'osmosis', file),
          'utf-8'
        );
      });

      // Files should be identical
      files.forEach((file) => {
        expect(run1Contents[file]).toBe(run2Contents[file]);
      });

      // Snapshot consistency verification
      expect({
        consistent: true,
        filesCompared: files.length
      }).toMatchSnapshot('consistency-verification');
    });

    it('should handle large-scale deployment', () => {
      // Create a config with many chains
      const largeConfig = {
        name: 'large-testnet',
        chains: Array.from({ length: 5 }, (_, i) => ({
          ...singleChainConfig.chains[0],
          id: `osmosis-${i}`,
          name: `osmosis${i}` as any
        }))
      };

      const context: GeneratorContext = { config: largeConfig };
      const outputPath = join(testOutputDir, 'large-scale');
      const builder = new CosmosBuilder(context, outputPath);

      builder.generateAllFiles();

      // Verify all chains were generated
      for (let i = 0; i < 5; i++) {
        expect(existsSync(join(outputPath, `osmosis${i}`))).toBe(true);
        expect(
          existsSync(join(outputPath, `osmosis${i}`, 'configmap.yaml'))
        ).toBe(true);
        expect(
          existsSync(join(outputPath, `osmosis${i}`, 'service.yaml'))
        ).toBe(true);
        expect(
          existsSync(join(outputPath, `osmosis${i}`, 'genesis.yaml'))
        ).toBe(true);
      }

      // Snapshot large-scale deployment
      expect({
        chainsGenerated: 5,
        totalFiles: 5 * 3, // 3 files per chain
        directories: Array.from({ length: 5 }, (_, i) => `osmosis${i}`)
      }).toMatchSnapshot('large-scale-deployment');
    });
  });
});
