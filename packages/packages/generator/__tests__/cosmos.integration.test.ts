import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { CosmosBuilder } from '../src/builders/cosmos';
import { applyDefaults } from '../src/defaults';
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
    if (!existsSync(testOutputDir)) {
      mkdirSync(testOutputDir, { recursive: true });
    }
  });

  describe('Direct CosmosBuilder Integration', () => {
    it('should generate complete single-chain setup using CosmosBuilder', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.buildManifests();

      expect(manifests.length).toBeGreaterThan(0);

      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');

      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);
      expect(configMaps.length).toBeGreaterThan(0);

      // Snapshot test for direct builder usage
      expect({
        serviceCount: services.length,
        statefulSetCount: statefulSets.length,
        configMapCount: configMaps.length,
        totalManifests: manifests.length
      }).toMatchSnapshot('complete-single-chain-setup-builder');
    });

    it('should handle different chain types in same deployment', () => {
      const processedConfig = applyDefaults(twoChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.buildManifests();

      const osmosisManifests = manifests.filter((m: any) =>
        m.metadata?.name?.includes('osmosis')
      );
      const cosmoshubManifests = manifests.filter((m: any) =>
        m.metadata?.name?.includes('cosmoshub')
      );

      expect(osmosisManifests.length).toBeGreaterThan(0);
      expect(cosmoshubManifests.length).toBeGreaterThan(0);

      // Snapshot test
      expect({
        osmosisCount: osmosisManifests.length,
        cosmoshubCount: cosmoshubManifests.length
      }).toMatchSnapshot('mixed-chain-types-setup');
    });
  });

  describe('Resource Content Verification', () => {
    it('should generate correct labels and annotations', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.buildManifests();

      const services = manifests.filter(
        (m: any) => m.kind === 'Service'
      ) as any[];
      const genesisService = services.find((s: any) =>
        s.metadata.name.includes('genesis')
      );

      expect(genesisService).toBeDefined();
      expect(genesisService.metadata.labels).toBeDefined();
      expect(
        genesisService.metadata.labels['app.kubernetes.io/name']
      ).toContain('osmosis');

      // Snapshot test for resource labels and annotations
      expect({
        serviceLabels: genesisService.metadata.labels,
        serviceName: genesisService.metadata.name
      }).toMatchSnapshot('resource-labels-annotations');
    });

    it('should generate correct environment variables', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      ) as any[];
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

      if (validatorContainer) {
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
      }

      // Snapshot environment configuration
      expect({
        containerCount: containers.length,
        hasValidatorContainer: !!validatorContainer,
        envVarCount: validatorContainer?.env?.length || 0,
        hasChainId: !!validatorContainer?.env?.find(
          (e: any) => e.name === 'CHAIN_ID'
        ),
        hasDenom: !!validatorContainer?.env?.find(
          (e: any) => e.name === 'DENOM'
        )
      }).toMatchSnapshot('environment-variables');
    });

    it('should generate correct port mappings', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const services = manifests.filter(
        (m: any) => m.kind === 'Service'
      ) as any[];
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

        const statefulSets = manifests.filter(
          (m: any) => m.kind === 'StatefulSet'
        );
        const hasGenesis = statefulSets.some((ss: any) =>
          ss.metadata.name.includes('genesis')
        );

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
          validationResults[name] = {
            success: true,
            manifestCount: manifests.length,
            error: null
          };
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

      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      ) as any[];
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
