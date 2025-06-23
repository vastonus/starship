import { existsSync, mkdirSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import { CosmosBuilder } from '../src/builders/cosmos';
import { applyDefaults } from '../src/defaults';
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

  beforeEach(() => {
    mkdirSync(testOutputDir, { recursive: true });
  });

  describe('Builder Creation', () => {
    it('should create CosmosBuilder', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      expect(builder).toBeDefined();
    });
  });

  describe('Manifest Generation', () => {
    it('should generate all manifests for a single chain', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      expect(manifests.length).toBeGreaterThan(0);

      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');

      expect(configMaps.length).toBeGreaterThan(0);
      expect(services.length).toBe(1); // Only genesis service for single validator
      expect(statefulSets.length).toBe(1); // Only genesis statefulset for single validator

      // Check that we have keys ConfigMap
      const keysConfigMap = configMaps.find((cm: any) => cm.metadata.name === 'keys');
      expect(keysConfigMap).toBeDefined();

      // Check that we have setup scripts ConfigMap for the chain
      const setupScriptsConfigMap = configMaps.find((cm: any) => 
        cm.metadata.name.startsWith('setup-scripts-osmosis')
      );
      expect(setupScriptsConfigMap).toBeDefined();

      // Snapshot test
      expect(manifests).toMatchSnapshot('single-chain-all-manifests');
    });

    it('should generate all manifests for a multi-validator chain', () => {
      const builder = new CosmosBuilder(multiValidatorConfig);
      const manifests = builder.buildManifests();

      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');

      expect(services.length).toBe(2); // Genesis and validator services
      expect(statefulSets.length).toBe(2); // Genesis and validator statefulsets

      // Snapshot test
      expect(manifests).toMatchSnapshot('multi-validator-chain-all-manifests');
    });

    it('should generate genesis patch ConfigMap when genesis exists', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap') as any[];
      const patchConfigMap = configMaps.find((cm: any) => 
        cm.metadata.name.startsWith('patch-osmosis')
      );

      expect(patchConfigMap).toBeDefined();
      expect(patchConfigMap?.kind).toBe('ConfigMap');

      const genesisJsonString = patchConfigMap?.data?.['genesis.json'] as string;
      const genesisData = JSON.parse(genesisJsonString || '{}');
      expect(genesisData.app_state.staking.params.unbonding_time).toBe('5s');

      // Snapshot test
      expect(patchConfigMap).toMatchSnapshot('genesis-patch-configmap');
    });

    it('should not generate genesis patch when no genesis', () => {
      const builder = new CosmosBuilder(multiValidatorConfig);
      const manifests = builder.buildManifests();

      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap') as any[];
      const patchConfigMap = configMaps.find((cm: any) => 
        cm.metadata.name.startsWith('patch-')
      );

      expect(patchConfigMap).toBeUndefined();

      // Snapshot test
      expect(patchConfigMap).toMatchSnapshot('null-genesis-patch-configmap');
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

      const builder = new CosmosBuilder(icsConfig);
      const manifests = builder.buildManifests();

      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap') as any[];
      const icsConfigMap = configMaps.find((cm: any) => 
        cm.metadata.name.startsWith('consumer-proposal-osmosis')
      );

      expect(icsConfigMap).toBeDefined();
      expect(icsConfigMap?.kind).toBe('ConfigMap');

      const proposalJsonString = icsConfigMap?.data?.['proposal.json'] as string;
      const proposalData = JSON.parse(proposalJsonString || '{}');
      expect(proposalData.chain_id).toBe('osmosis-1');
      expect(proposalData.title).toContain('osmosis');

      // Snapshot test
      expect(icsConfigMap).toMatchSnapshot('ics-consumer-proposal-configmap');
    });

    it('should handle different chain configurations', () => {
      // Test custom chain
      const customBuilder = new CosmosBuilder(customChainConfig);
      const customManifests = customBuilder.buildManifests();
      const customServices = customManifests.filter((m: any) => m.kind === 'Service');
      expect(customServices[0]?.metadata?.name).toContain('custom');
      expect(customManifests).toMatchSnapshot('custom-chain-manifests');

      // Test build-enabled chain
      const buildBuilder = new CosmosBuilder(buildChainConfig);
      const buildManifests = buildBuilder.buildManifests();
      const buildServices = buildManifests.filter((m: any) => m.kind === 'Service');
      expect(buildServices[0]?.metadata?.name).toContain('persistencecore');
      expect(buildManifests).toMatchSnapshot('build-enabled-chain-manifests');
    });

    it('should handle different faucet configurations', () => {
      // Test starship faucet
      const starshipBuilder = new CosmosBuilder(singleChainConfig);
      const starshipManifests = starshipBuilder.buildManifests();
      expect(starshipManifests).toMatchSnapshot('starship-faucet-manifests');

      // Test cosmjs faucet
      const cosmjsBuilder = new CosmosBuilder(cosmjsFaucetConfig);
      const cosmjsManifests = cosmjsBuilder.buildManifests();
      expect(cosmjsManifests).toMatchSnapshot('cosmjs-faucet-manifests');
    });

    it('should handle cometmock configuration', () => {
      const builder = new CosmosBuilder(cometmockConfig);
      const manifests = builder.buildManifests();

      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');
      expect(statefulSets.length).toBeGreaterThan(0);

      // Check that readiness probe is handled for cometmock
      const genesisStatefulSet = statefulSets.find((ss: any) => 
        ss.metadata.name.includes('genesis')
      );
      expect(genesisStatefulSet).toBeDefined();

      // Snapshot test
      expect(manifests).toMatchSnapshot('cometmock-manifests');
    });

    it('should skip Ethereum chains', () => {
      const builder = new CosmosBuilder(ethereumConfig);
      const manifests = builder.buildManifests();

      expect(manifests.length).toBe(0);

      // Snapshot test
      expect(manifests).toMatchSnapshot('ethereum-chain-empty-manifests');
    });
  });

  describe('Configuration Processing', () => {
    it('should apply defaults correctly', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      
      expect(processedConfig.chains).toBeDefined();
      expect(processedConfig.chains.length).toBe(1);
      
      const chain = processedConfig.chains[0];
      expect(chain.id).toBe('osmosis-1');
      expect(chain.name).toBe('osmosis');
    });

    it('should handle chain name conversion', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();
      
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const genesisService = services.find((s: any) => s.metadata.name.includes('genesis'));
      
      // Should use chain name converted properly
      expect(genesisService?.metadata?.name).toContain('osmosis');
    });
  });

  describe('Resource Validation', () => {
    it('should generate correct labels', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');
      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet');

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
    });

    it('should generate correct port mappings', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const services = manifests.filter((m: any) => m.kind === 'Service') as any[];
      const genesisService = services.find((s: any) => s.metadata.name.includes('genesis'));

      const ports = genesisService?.spec?.ports || [];
      expect(ports.length).toBeGreaterThan(0);

      // Check for RPC port
      const rpcPort = ports.find((p: any) => p.name === 'rpc');
      expect(rpcPort).toBeDefined();
      expect(rpcPort?.port).toBe(26657);

      // Check for metrics port if enabled
      if (singleChainConfig.chains[0].metrics) {
        const metricsPort = ports.find((p: any) => p.name === 'metrics');
        expect(metricsPort).toBeDefined();
        expect(metricsPort?.port).toBe(26660);
      }
    });

    it('should generate correct environment variables', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.buildManifests();

      const statefulSets = manifests.filter((m: any) => m.kind === 'StatefulSet') as any[];
      const genesisStatefulSet = statefulSets.find((ss: any) => 
        ss.metadata.name.includes('genesis')
      );

      expect(genesisStatefulSet).toBeDefined();
      
      const containers = genesisStatefulSet?.spec?.template?.spec?.containers || [];
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
      }
    });
  });
});