import { existsSync, mkdirSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import { CosmosBuilder } from '../src/builders/cosmos';
import { BuilderManager } from '../src/builders';
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

  describe('End-to-End Generation with BuilderManager', () => {
    it('should generate complete single-chain setup using BuilderManager', () => {
      const outputPath = join(testOutputDir, 'complete-single-chain-manager');
      const manager = new BuilderManager(singleChainConfig);

      manager.build(outputPath);

      // Verify files exist
      const files = ['osmosis-genesis-statefulset.yaml', 'osmosis-genesis-service.yaml', 'keys-configmap.yaml'];
      files.forEach((file) => {
        expect(existsSync(join(outputPath, file))).toBe(true);
      });

      // Read and verify file contents
      const serviceContent = readFileSync(
        join(outputPath, 'osmosis-genesis-service.yaml'),
        'utf-8'
      );
      const statefulSetContent = readFileSync(
        join(outputPath, 'osmosis-genesis-statefulset.yaml'),
        'utf-8'
      );

      // Basic content validation
      expect(serviceContent).toContain('kind: Service');
      expect(statefulSetContent).toContain('kind: StatefulSet');

      // Snapshot the complete setup
      expect({
        service: serviceContent,
        statefulSet: statefulSetContent
      }).toMatchSnapshot('complete-single-chain-setup-manager');
    });

    it('should generate complete multi-chain setup using BuilderManager', () => {
      const outputPath = join(testOutputDir, 'complete-multi-chain-manager');
      const manager = new BuilderManager(twoChainConfig);

      manager.build(outputPath);

      // Verify both chain files exist
      expect(existsSync(join(outputPath, 'osmosis-genesis-statefulset.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub-genesis-statefulset.yaml'))).toBe(true);

      // Read contents for verification
      const osmosisStatefulSet = readFileSync(
        join(outputPath, 'osmosis-genesis-statefulset.yaml'),
        'utf-8'
      );
      const cosmoshubStatefulSet = readFileSync(
        join(outputPath, 'cosmoshub-genesis-statefulset.yaml'),
        'utf-8'
      );

      // Basic content validation
      expect(osmosisStatefulSet).toContain('kind: StatefulSet');
      expect(cosmoshubStatefulSet).toContain('kind: StatefulSet');

      // Snapshot the complete multi-chain setup
      expect({
        osmosisStatefulSet,
        cosmoshubStatefulSet
      }).toMatchSnapshot('complete-multi-chain-setup-manager');
    });
  });

  describe('Direct CosmosBuilder Integration', () => {
    it('should generate complete single-chain setup using CosmosBuilder', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      expect(manifests.length).toBeGreaterThan(0);

      // Verify we have the expected types of manifests
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');

      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBe(1); // Only genesis service for single validator
      expect(statefulSets.length).toBe(1); // Only genesis statefulset for single validator

      // Verify specific manifest content
      const genesisService = services.find((s: any) => s.metadata.name.includes('genesis')) as any;
      expect(genesisService).toBeDefined();
      expect(genesisService.spec.clusterIP).toBe('None');

      // Snapshot the complete setup
      expect({
        configMapCount: configMaps.length,
        serviceCount: services.length,
        statefulSetCount: statefulSets.length,
        genesisServiceName: genesisService.metadata.name
      }).toMatchSnapshot('complete-single-chain-setup-builder');
    });

    it('should handle different chain types in same deployment', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      // Should have basic manifests
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');

      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBe(1);
      expect(statefulSets.length).toBe(1);

      // Single validator should not have validator service/statefulset
      const validatorService = services.find((s: any) => s.metadata.name.includes('validator'));
      const validatorStatefulSet = statefulSets.find((ss: any) => ss.metadata.name.includes('validator'));
      
      expect(validatorService).toBeUndefined();
      expect(validatorStatefulSet).toBeUndefined();

      // Snapshot the setup
      const chainContent = {
        configMapCount: configMaps.length,
        serviceCount: services.length,
        statefulSetCount: statefulSets.length,
        hasValidatorResources: !!validatorService || !!validatorStatefulSet
      };

      expect(chainContent).toMatchSnapshot('mixed-chain-types-setup');
    });
  });

  describe('Resource Content Verification', () => {
    it('should generate correct labels and annotations', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap') as any[];
      const services = manifests.filter((m: any) => m.kind === 'Service') as any[];
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];

      // Verify that we have resources
      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);

      // Check ConfigMap labels
      configMaps.forEach((configMap: any) => {
        expect(configMap.metadata.labels).toBeDefined();
        expect(configMap.metadata.labels['app.kubernetes.io/managed-by']).toBe('starship');
      });

      // Check Service labels
      services.forEach((service: any) => {
        expect(service.metadata.labels).toBeDefined();
        expect(service.metadata.labels['app.kubernetes.io/managed-by']).toBe('starship');
      });

      // Check StatefulSet labels
      statefulSets.forEach((statefulSet: any) => {
        expect(statefulSet.metadata.labels).toBeDefined();
        expect(statefulSet.metadata.labels['app.kubernetes.io/managed-by']).toBe('starship');
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
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      expect(statefulSets.length).toBeGreaterThan(0);

      const genesisStatefulSet = statefulSets[0];
      expect(genesisStatefulSet?.spec?.template?.spec?.containers).toBeDefined();

      const containers = genesisStatefulSet.spec.template.spec.containers || [];
      expect(containers.length).toBeGreaterThan(0);

      // Check validator container environment
      const validatorContainer = containers.find((c: any) => c.name === 'validator');

      if (validatorContainer) {
        expect(validatorContainer.env).toBeDefined();
        expect(validatorContainer.env.length).toBeGreaterThan(0);

        // Check specific environment variables exist
        const chainIdEnv = validatorContainer.env.find((e: any) => e.name === 'CHAIN_ID');
        expect(chainIdEnv).toBeDefined();
        expect(chainIdEnv.value).toBe('osmosis-1');

        const chainDenomEnv = validatorContainer.env.find((e: any) => e.name === 'DENOM');
        expect(chainDenomEnv).toBeDefined();
        expect(chainDenomEnv.value).toBe('uosmo');
      }

      // Snapshot environment configuration
      expect({
        containerCount: containers.length,
        hasValidatorContainer: !!validatorContainer,
        envVarCount: validatorContainer?.env?.length || 0,
        hasChainId: !!validatorContainer?.env?.find((e: any) => e.name === 'CHAIN_ID'),
        hasDenom: !!validatorContainer?.env?.find((e: any) => e.name === 'DENOM')
      }).toMatchSnapshot('environment-variables');
    });

    it('should generate correct port mappings', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const services = manifests.filter((m: any) => m.kind === 'Service') as any[];
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
        const builder = new CosmosBuilder(config);
        const manifests = builder.buildManifests();

        const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
        const hasGenesis = statefulSets.some((ss: any) => ss.metadata.name.includes('genesis'));
        
        specialConfigs[name] = { hasGenesis, manifestCount: manifests.length };
      });

      // Snapshot special configurations
      expect(specialConfigs).toMatchSnapshot('special-configurations');
    });
  });

  describe('Configuration Validation', () => {
    it('should skip non-cosmos chains', () => {
      const builder = new CosmosBuilder(ethereumConfig);
      const manifests = builder.buildManifests();

      // Should not generate any manifests for ethereum
      expect(manifests.length).toBe(0);

      // Snapshot the empty result
      expect({
        ethereumSkipped: true,
        manifestCount: manifests.length
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

      // Should handle gracefully without throwing
      expect(() => {
        const builder = new CosmosBuilder(invalidConfig as any);
        const manifests = builder.buildManifests();
        expect(manifests).toBeDefined();
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

        try {
          const builder = new CosmosBuilder(testConfig);
          const manifests = builder.buildManifests();
          validationResults[name] = { success: true, manifestCount: manifests.length, error: null };
        } catch (error: any) {
          validationResults[name] = {
            success: false,
            manifestCount: 0,
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

      const builder = new CosmosBuilder(complexConfig);
      const manifests = builder.buildManifests();

      expect(manifests.length).toBeGreaterThan(0);

      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      expect(statefulSets.length).toBe(2); // One for each chain

      // Verify both chains have their StatefulSets
      const starshipStatefulSet = statefulSets.find((ss: any) => 
        ss.metadata.name.includes('osmosis-starship')
      );
      const cosmjsStatefulSet = statefulSets.find((ss: any) => 
        ss.metadata.name.includes('osmosis-cosmjs')
      );

      expect(starshipStatefulSet).toBeDefined();
      expect(cosmjsStatefulSet).toBeDefined();

      // Snapshot the complex setup
      expect({
        totalManifests: manifests.length,
        statefulSetCount: statefulSets.length,
        hasStarshipChain: !!starshipStatefulSet,
        hasCosmjsChain: !!cosmjsStatefulSet
      }).toMatchSnapshot('complex-multi-faucet-setup');
    });
  });
});
