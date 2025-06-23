import { RelayerBuilder } from '../src/builders/relayer';
import { singleChainConfig } from './test-utils/config';

describe('RelayerBuilder', () => {
  it('should generate no manifests when no relayers are configured', () => {
    const config = { ...singleChainConfig };
    delete config.relayers;

    const builder = new RelayerBuilder(config);
    const manifests = builder.buildManifests();

    expect(manifests).toEqual([]);
  });

  it('should generate manifests for a hermes relayer', () => {
    const config = {
      ...singleChainConfig,
      relayers: [
        {
          name: 'osmo-cosmos',
          type: 'hermes' as const,
          replicas: 1,
          chains: ['osmosis-1', 'cosmoshub-4'],
          config: {
            global: { log_level: 'info' },
            mode: {
              clients: { enabled: true, refresh: true, misbehaviour: true },
              connections: { enabled: true },
              channels: { enabled: true },
              packets: { enabled: true, clear_interval: 100, clear_on_start: true, tx_confirmation: true }
            },
            rest: { enabled: true, host: '0.0.0.0', port: 3000 },
            telemetry: { enabled: true, host: '0.0.0.0', port: 3001 }
          }
        }
      ]
    };

    const builder = new RelayerBuilder(config);
    const manifests = builder.buildManifests();

    expect(manifests).toHaveLength(3); // ConfigMap, Service, StatefulSet

    const configMap = manifests.find(m => m.kind === 'ConfigMap');
    const service = manifests.find(m => m.kind === 'Service');
    const statefulSet = manifests.find(m => m.kind === 'StatefulSet');

    expect(configMap).toBeDefined();
    expect(configMap.metadata.name).toBe('hermes-osmo-cosmos');
    expect(configMap.data['config.toml']).toContain('log_level = "info"');

    expect(service).toBeDefined();
    expect(service.metadata.name).toBe('hermes-osmo-cosmos');
    expect(service.spec.ports).toHaveLength(2); // rest and exposer

    expect(statefulSet).toBeDefined();
    expect(statefulSet.metadata.name).toBe('hermes-osmo-cosmos');
    expect(statefulSet.spec.replicas).toBe(1);
  });

  it('should generate manifests for a go-relayer', () => {
    const config = {
      ...singleChainConfig,
      relayers: [
        {
          name: 'go-rly',
          type: 'go-relayer' as const,
          replicas: 1,
          chains: ['osmosis-1', 'cosmoshub-4']
        }
      ]
    };

    const builder = new RelayerBuilder(config);
    const manifests = builder.buildManifests();

    expect(manifests).toHaveLength(2); // ConfigMap, StatefulSet (no service)

    const configMap = manifests.find(m => m.kind === 'ConfigMap');
    const statefulSet = manifests.find(m => m.kind === 'StatefulSet');

    expect(configMap).toBeDefined();
    expect(configMap.metadata.name).toBe('go-relayer-go-rly');
    expect(configMap.data['path.json']).toContain('osmosis-1');

    expect(statefulSet).toBeDefined();
    expect(statefulSet.metadata.name).toBe('go-relayer-go-rly');
  });

  it('should generate manifests for a ts-relayer', () => {
    const config = {
      ...singleChainConfig,
      relayers: [
        {
          name: 'ts-rly',
          type: 'ts-relayer' as const,
          replicas: 1,
          chains: ['osmosis-1', 'cosmoshub-4']
        }
      ]
    };

    const builder = new RelayerBuilder(config);
    const manifests = builder.buildManifests();

    expect(manifests).toHaveLength(2); // ConfigMap, StatefulSet (no service)

    const configMap = manifests.find(m => m.kind === 'ConfigMap');
    const statefulSet = manifests.find(m => m.kind === 'StatefulSet');

    expect(configMap).toBeDefined();
    expect(configMap.metadata.name).toBe('ts-relayer-ts-rly');
    expect(configMap.data['template-app.yaml']).toContain('<SRC>');
    expect(configMap.data['registry.yaml']).toContain('osmosis-1');

    expect(statefulSet).toBeDefined();
    expect(statefulSet.metadata.name).toBe('ts-relayer-ts-rly');
  });

  it('should generate manifests for a neutron-query-relayer', () => {
    const neutronConfig = {
      ...singleChainConfig,
      chains: [
        ...singleChainConfig.chains,
        {
          id: 'neutron-1',
          name: 'neutron' as const,
          numValidators: 1,
          prefix: 'neutron',
          denom: 'untrn',
          home: '/root/.neutrond'
        }
      ],
      relayers: [
        {
          name: 'neutron-query',
          type: 'neutron-query-relayer' as const,
          replicas: 1,
          chains: ['neutron-1', 'osmosis-1'],
          config: {
            RELAYER_NEUTRON_CHAIN_TIMEOUT: '1000s',
            RELAYER_NEUTRON_CHAIN_GAS_PRICES: '0.5untrn'
          }
        }
      ]
    };

    const builder = new RelayerBuilder(neutronConfig);
    const manifests = builder.buildManifests();

    expect(manifests).toHaveLength(3); // ConfigMap, Service, StatefulSet

    const configMap = manifests.find(m => m.kind === 'ConfigMap');
    const service = manifests.find(m => m.kind === 'Service');
    const statefulSet = manifests.find(m => m.kind === 'StatefulSet');

    expect(configMap).toBeDefined();
    expect(configMap.metadata.name).toBe('neutron-query-relayer-neutron-query');

    expect(service).toBeDefined();
    expect(service.metadata.name).toBe('neutron-query-relayer-neutron-query');

    expect(statefulSet).toBeDefined();
    expect(statefulSet.metadata.name).toBe('neutron-query-relayer-neutron-query');
  });

  it('should handle multiple relayers', () => {
    const config = {
      ...singleChainConfig,
      relayers: [
        {
          name: 'hermes-rly',
          type: 'hermes' as const,
          replicas: 1,
          chains: ['osmosis-1', 'cosmoshub-4']
        },
        {
          name: 'go-rly',
          type: 'go-relayer' as const,
          replicas: 1,
          chains: ['osmosis-1', 'cosmoshub-4']
        }
      ]
    };

    const builder = new RelayerBuilder(config);
    const manifests = builder.buildManifests();

    expect(manifests).toHaveLength(5); // 2 relayers: hermes (3 manifests) + go-relayer (2 manifests)

    const hermesManifests = manifests.filter(m => 
      m.metadata.name.includes('hermes-rly')
    );
    const goRelayerManifests = manifests.filter(m => 
      m.metadata.name.includes('go-relayer-go-rly')
    );

    expect(hermesManifests).toHaveLength(3);
    expect(goRelayerManifests).toHaveLength(2);
  });

  it('should use custom image when provided', () => {
    const config = {
      ...singleChainConfig,
      relayers: [
        {
          name: 'custom-hermes',
          type: 'hermes' as const,
          image: 'custom/hermes:latest',
          replicas: 1,
          chains: ['osmosis-1', 'cosmoshub-4']
        }
      ]
    };

    const builder = new RelayerBuilder(config);
    const manifests = builder.buildManifests();

    const statefulSet = manifests.find(m => m.kind === 'StatefulSet');
    const initContainers = statefulSet.spec.template.spec.initContainers;
    const containers = statefulSet.spec.template.spec.containers;

    const relayerInitContainer = initContainers.find((c: any) => c.name === 'init-relayer');
    const relayerContainer = containers.find((c: any) => c.name === 'relayer');

    expect(relayerInitContainer.image).toBe('custom/hermes:latest');
    expect(relayerContainer.image).toBe('custom/hermes:latest');
  });
}); 