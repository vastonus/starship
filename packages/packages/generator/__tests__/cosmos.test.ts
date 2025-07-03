import { mkdirSync } from 'fs';
import { join } from 'path';

import { CosmosBuilder } from '../src/builders/chains/cosmos';
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
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      expect(builder).toBeDefined();
    });
  });

  describe('Manifest Generation', () => {
    it('should generate all manifests for a single chain', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      expect(manifests.length).toBeGreaterThan(0);

      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );
      const configMaps = manifests.filter((m: any) => m.kind === 'ConfigMap');

      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);
      expect(configMaps.length).toBeGreaterThan(0);

      const genesisService = services.find((s: any) =>
        s.metadata.name.includes('genesis')
      );
      const setupScriptsConfigMap = configMaps.find((cm: any) =>
        cm.metadata.name.startsWith('setup-scripts')
      );

      expect(genesisService).toBeDefined();
      expect(setupScriptsConfigMap).toBeDefined();

      // Snapshot test
      expect(manifests).toMatchSnapshot('single-chain-all-manifests');
    });

    it('should generate all manifests for a multi-validator chain', () => {
      const processedConfig = applyDefaults(multiValidatorConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      expect(manifests.length).toBeGreaterThan(0);

      const services = manifests.filter((m: any) => m.kind === 'Service');
      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );

      // Multi-validator should have both genesis and validator services/statefulsets
      expect(services.length).toBe(2); // Genesis + validator services
      expect(statefulSets.length).toBe(2); // Genesis + validator statefulsets

      const genesisService = services.find((s: any) =>
        s.metadata.name.includes('genesis')
      );
      const validatorService = services.find((s: any) =>
        s.metadata.name.includes('validator')
      );
      const genesisStatefulSet = statefulSets.find((ss: any) =>
        ss.metadata.name.includes('genesis')
      );
      const validatorStatefulSet = statefulSets.find((ss: any) =>
        ss.metadata.name.includes('validator')
      );

      expect(genesisService).toBeDefined();
      expect(validatorService).toBeDefined();
      expect(genesisStatefulSet).toBeDefined();
      expect(validatorStatefulSet).toBeDefined();

      // Validator StatefulSet should have correct replica count (numValidators - 1)
      expect((validatorStatefulSet as any).spec.replicas).toBe(1); // 2 validators - 1 genesis = 1 validator replica

      // Snapshot test
      expect(manifests).toMatchSnapshot('multi-validator-all-manifests');
    });

    it('should generate genesis patch ConfigMap when genesis exists', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      const configMaps = manifests.filter(
        (m: any) => m.kind === 'ConfigMap'
      ) as any[];
      const patchConfigMap = configMaps.find((cm: any) =>
        cm.metadata.name.startsWith('patch-osmosis')
      );

      expect(patchConfigMap).toBeDefined();
      expect(patchConfigMap?.kind).toBe('ConfigMap');

      const genesisJsonString = patchConfigMap?.data?.[
        'genesis.json'
      ] as string;
      const genesisData = JSON.parse(genesisJsonString || '{}');
      expect(genesisData.app_state.staking.params.unbonding_time).toBe('5s');

      // Snapshot test
      expect(patchConfigMap).toMatchSnapshot('genesis-patch-configmap');
    });

    it('should not generate genesis patch when no genesis', () => {
      const builder = new CosmosBuilder(multiValidatorConfig);
      const manifests = builder.generate();

      const configMaps = manifests.filter(
        (m: any) => m.kind === 'ConfigMap'
      ) as any[];
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
      const manifests = builder.generate();

      const configMaps = manifests.filter(
        (m: any) => m.kind === 'ConfigMap'
      ) as any[];
      const icsConfigMap = configMaps.find((cm: any) =>
        cm.metadata.name.startsWith('consumer-proposal-osmosis')
      );

      expect(icsConfigMap).toBeDefined();
      expect(icsConfigMap?.kind).toBe('ConfigMap');

      const proposalJsonString = icsConfigMap?.data?.[
        'proposal.json'
      ] as string;
      const proposalData = JSON.parse(proposalJsonString || '{}');
      expect(proposalData.chain_id).toBe('osmosis-1');
      expect(proposalData.title).toContain('osmosis');

      // Snapshot test
      expect(icsConfigMap).toMatchSnapshot('ics-consumer-proposal-configmap');
    });

    it('should handle different chain configurations', () => {
      // Test with build chain config
      const processedBuildConfig = applyDefaults(buildChainConfig);
      const buildBuilder = new CosmosBuilder(processedBuildConfig);
      const buildManifests = buildBuilder.generate();
      expect(buildManifests.length).toBeGreaterThan(0);

      // Find StatefulSet to verify build configuration
      const statefulSets = buildManifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );
      expect(statefulSets.length).toBeGreaterThan(0);

      const genesisStatefulSet = statefulSets.find((ss: any) =>
        ss.metadata.name.includes('genesis')
      );
      expect(genesisStatefulSet).toBeDefined();
      expect((genesisStatefulSet as any).metadata.name).toContain('core-1');

      // Test with custom chain config
      const processedCustomConfig = applyDefaults(customChainConfig);
      const customBuilder = new CosmosBuilder(processedCustomConfig);
      const customManifests = customBuilder.generate();
      expect(customManifests.length).toBeGreaterThan(0);

      // Test with ICS enabled config
      const icsConfig = {
        ...twoChainConfig,
        chains: [
          {
            ...twoChainConfig.chains[0],
            ics: {
              enabled: true,
              provider: 'cosmoshub-4'
            }
          },
          twoChainConfig.chains[1]
        ]
      };
      const processedIcsConfig = applyDefaults(icsConfig);
      const icsBuilder = new CosmosBuilder(processedIcsConfig);
      const icsManifests = icsBuilder.generate();
      expect(icsManifests.length).toBeGreaterThan(0);

      // Check for ICS consumer proposal ConfigMap
      const icsConfigMaps = icsManifests.filter(
        (m: any) => m.kind === 'ConfigMap'
      );
      const consumerProposal = icsConfigMaps.find((cm: any) =>
        cm.metadata.name.includes('consumer-proposal')
      );
      expect(consumerProposal).toBeDefined();

      // Snapshot test
      expect({
        buildManifestCount: buildManifests.length,
        customManifestCount: customManifests.length,
        icsManifestCount: icsManifests.length,
        hasConsumerProposal: !!consumerProposal
      }).toMatchSnapshot('different-chain-configurations');
    });

    it('should handle different faucet configurations', () => {
      // Test starship faucet
      const processedStarshipConfig = applyDefaults(singleChainConfig);
      const starshipBuilder = new CosmosBuilder(processedStarshipConfig);
      const starshipManifests = starshipBuilder.generate();
      expect(starshipManifests).toMatchSnapshot('starship-faucet-manifests');

      // Test cosmjs faucet
      const processedCosmjsConfig = applyDefaults(cosmjsFaucetConfig);
      const cosmjsBuilder = new CosmosBuilder(processedCosmjsConfig);
      const cosmjsManifests = cosmjsBuilder.generate();
      expect(cosmjsManifests).toMatchSnapshot('cosmjs-faucet-manifests');
    });

    it('should handle cometmock configuration', () => {
      const processedConfig = applyDefaults(cometmockConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      );
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
      const manifests = builder.generate();

      expect(manifests.length).toBe(0);

      // Snapshot test
      expect(manifests).toMatchSnapshot('ethereum-chain-empty-manifests');
    });
  });

  describe('Configuration Processing', () => {
    it('should apply defaults correctly', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      // Verify that defaults have been applied
      expect(processedConfig.chains[0].scripts).toBeDefined();
      expect(processedConfig.chains[0].faucet).toBeDefined();
      expect(manifests.length).toBeGreaterThan(0);

      // Snapshot test
      expect({
        chainCount: processedConfig.chains.length,
        manifestCount: manifests.length,
        hasScripts: !!processedConfig.chains[0].scripts,
        hasFaucet: !!processedConfig.chains[0].faucet
      }).toMatchSnapshot('apply-defaults-result');
    });

    it('should handle chain name conversion', () => {
      const processedConfig = applyDefaults(customChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      const services = manifests.filter((m: any) => m.kind === 'Service');
      expect(services[0]?.metadata?.name).toContain('custom-1');

      // Snapshot test
      expect({
        serviceName: services[0]?.metadata?.name,
        chainId: processedConfig.chains[0].id
      }).toMatchSnapshot('chain-name-conversion');
    });
  });

  describe('Resource Validation', () => {
    it('should generate correct labels', () => {
      const processedConfig = applyDefaults(singleChainConfig);
      const builder = new CosmosBuilder(processedConfig);
      const manifests = builder.generate();

      const services = manifests.filter(
        (m: any) => m.kind === 'Service'
      ) as any[];
      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      ) as any[];
      const configMaps = manifests.filter(
        (m: any) => m.kind === 'ConfigMap'
      ) as any[];

      expect(services.length).toBeGreaterThan(0);
      expect(statefulSets.length).toBeGreaterThan(0);
      expect(configMaps.length).toBeGreaterThan(0);

      // Check Service labels
      const genesisService = services.find((s: any) =>
        s.metadata.name.includes('genesis')
      );
      expect(genesisService).toBeDefined();
      expect(genesisService.metadata.labels).toBeDefined();
      expect(
        genesisService.metadata.labels['app.kubernetes.io/managed-by']
      ).toBe('starship');

      // Check StatefulSet labels
      const genesisStatefulSet = statefulSets.find((ss: any) =>
        ss.metadata.name.includes('genesis')
      );
      expect(genesisStatefulSet).toBeDefined();
      expect(genesisStatefulSet.metadata.labels).toBeDefined();
      expect(
        genesisStatefulSet.metadata.labels['app.kubernetes.io/managed-by']
      ).toBe('starship');

      // Snapshot test for labels
      expect({
        serviceLabels: genesisService.metadata.labels,
        statefulSetLabels: genesisStatefulSet.metadata.labels,
        serviceCount: services.length,
        statefulSetCount: statefulSets.length
      }).toMatchSnapshot('resource-labels');
    });

    it('should generate correct port mappings', () => {
      const builder = new CosmosBuilder(singleChainConfig);
      const manifests = builder.generate();

      const services = manifests.filter(
        (m: any) => m.kind === 'Service'
      ) as any[];
      const genesisService = services.find((s: any) =>
        s.metadata.name.includes('genesis')
      );

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
      const manifests = builder.generate();

      const statefulSets = manifests.filter(
        (m: any) => m.kind === 'StatefulSet'
      ) as any[];
      const genesisStatefulSet = statefulSets.find((ss: any) =>
        ss.metadata.name.includes('genesis')
      );

      expect(genesisStatefulSet).toBeDefined();

      const containers =
        genesisStatefulSet?.spec?.template?.spec?.containers || [];
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
      }
    });
  });
});
