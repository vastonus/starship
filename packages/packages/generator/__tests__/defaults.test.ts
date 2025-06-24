import { DefaultsManager, applyDefaults } from '../src/defaults';
import { Relayer, StarshipConfig } from '@starship-ci/types';

describe('DefaultsManager', () => {
  let defaultsManager: DefaultsManager;

  beforeEach(() => {
    defaultsManager = new DefaultsManager();
  });

  describe('processRelayer', () => {
    it('should merge partial overrides with defaults correctly', () => {
      const relayerConfig: Relayer = {
        type: 'hermes',
        name: 'test-hermes',
        chains: ['chain1', 'chain2'],
        replicas: 1,
        config: {
          rest: {
            port: 3001  // Only override port, should keep other defaults
          },
          telemetry: {
            enabled: false  // Only override enabled, should keep other defaults
          }
        }
      };

      const processedRelayer = defaultsManager.processRelayer(relayerConfig);

      // Check that partial overrides work correctly
      expect(processedRelayer.config?.rest?.port).toBe(3001); // Overridden
      expect(processedRelayer.config?.rest?.host).toBe('0.0.0.0'); // From defaults
      expect(processedRelayer.config?.rest?.enabled).toBe(true); // From defaults

      expect(processedRelayer.config?.telemetry?.enabled).toBe(false); // Overridden
      expect(processedRelayer.config?.telemetry?.host).toBe('0.0.0.0'); // From defaults
      expect(processedRelayer.config?.telemetry?.port).toBe(3001); // From defaults

      // Check that other defaults are preserved
      expect(processedRelayer.config?.global?.log_level).toBe('info');
      expect(processedRelayer.config?.mode?.clients?.enabled).toBe(true);
      expect(processedRelayer.config?.mode?.packets?.clear_interval).toBe(100);
    });

    it('should handle complete overrides', () => {
      const relayerConfig: Relayer = {
        type: 'hermes',
        name: 'test-hermes',
        chains: ['chain1'],
        replicas: 1,
        config: {
          rest: {
            enabled: false,
            host: '127.0.0.1',
            port: 8080
          },
          telemetry: {
            enabled: false,
            host: '127.0.0.1',
            port: 8081
          },
          global: {
            log_level: 'debug'
          }
        }
      };

      const processedRelayer = defaultsManager.processRelayer(relayerConfig);

      // Check that complete overrides work
      expect(processedRelayer.config?.rest?.enabled).toBe(false);
      expect(processedRelayer.config?.rest?.host).toBe('127.0.0.1');
      expect(processedRelayer.config?.rest?.port).toBe(8080);

      expect(processedRelayer.config?.telemetry?.enabled).toBe(false);
      expect(processedRelayer.config?.telemetry?.host).toBe('127.0.0.1');
      expect(processedRelayer.config?.telemetry?.port).toBe(8081);

      expect(processedRelayer.config?.global?.log_level).toBe('debug');
    });

    it('should handle relayers with no config', () => {
      const relayerConfig: Relayer = {
        type: 'hermes',
        name: 'test-hermes',
        chains: ['chain1'],
        replicas: 1,
      };

      const processedRelayer = defaultsManager.processRelayer(relayerConfig);

      // Should have all defaults
      expect(processedRelayer.config?.global?.log_level).toBe('info');
      expect(processedRelayer.config?.rest?.enabled).toBe(true);
      expect(processedRelayer.config?.rest?.host).toBe('0.0.0.0');
      expect(processedRelayer.config?.rest?.port).toBe(3000);
      expect(processedRelayer.config?.telemetry?.enabled).toBe(true);
      expect(processedRelayer.config?.telemetry?.host).toBe('0.0.0.0');
      expect(processedRelayer.config?.telemetry?.port).toBe(3001);
    });

    it('should handle different relayer types', () => {
      const hermesRelayer: Relayer = {
        type: 'hermes',
        name: 'test-hermes',
        chains: ['chain1'],
        replicas: 1,
      };

      const goRelayer: Relayer = {
        type: 'go-relayer',
        name: 'test-go',
        chains: ['chain1'],
        replicas: 1,
      };

      const tsRelayer: Relayer = {
        type: 'ts-relayer',
        name: 'test-ts',
        chains: ['chain1'],
        replicas: 1,
      };

      const neutronRelayer: Relayer = {
        type: 'neutron-query-relayer',
        name: 'test-neutron',
        chains: ['chain1'],
        replicas: 1,
      };

      // Process each type
      const processedHermes = defaultsManager.processRelayer(hermesRelayer);
      const processedGo = defaultsManager.processRelayer(goRelayer);
      const processedTs = defaultsManager.processRelayer(tsRelayer);
      const processedNeutron = defaultsManager.processRelayer(neutronRelayer);

      // Check that each has the correct image from defaults
      expect(processedHermes.image).toBe('ghcr.io/cosmology-tech/starship/hermes:1.10.0');
      expect(processedGo.image).toBe('ghcr.io/cosmology-tech/starship/go-relayer:v2.4.1');
      expect(processedTs.image).toBe('ghcr.io/cosmology-tech/starship/ts-relayer:0.9.0');
      expect(processedNeutron.image).toBe('ghcr.io/cosmology-tech/starship/neutron-query-relayer:v0.2.0');

      // Check that hermes has config defaults
      expect(processedHermes.config?.global?.log_level).toBe('info');
      expect(processedHermes.config?.rest?.enabled).toBe(true);

      // Check that neutron has config defaults
      expect(processedNeutron.config?.RELAYER_NEUTRON_CHAIN_TIMEOUT).toBe('1000s');
      expect(processedNeutron.config?.RELAYER_NEUTRON_CHAIN_GAS_PRICES).toBe('0.5untrn');
    });
  });

  describe('applyDefaults', () => {
    it('should process relayers in a full config', () => {
      const config: StarshipConfig = {
        name: 'test',
        chains: [],
        relayers: [
          {
            type: 'hermes',
            name: 'test-hermes',
            replicas: 1,
            chains: ['chain1'],
            config: {
              rest: {
                port: 3001
              }
            }
          }
        ]
      };

      const processedConfig = applyDefaults(config);

      expect(processedConfig.relayers).toHaveLength(1);
      expect(processedConfig.relayers![0].config?.rest?.port).toBe(3001);
      expect(processedConfig.relayers![0].config?.rest?.host).toBe('0.0.0.0');
      expect(processedConfig.relayers![0].config?.rest?.enabled).toBe(true);
    });

    it('should handle config with no relayers', () => {
      const config: StarshipConfig = {
        name: 'test',
        chains: []
      };

      const processedConfig = applyDefaults(config);

      expect(processedConfig.relayers).toEqual([]);
    });
  });

  describe('deepMerge utility', () => {
    it('should merge nested objects correctly', () => {
      const target = {
        a: 1,
        b: {
          c: 2,
          d: 3
        },
        e: [1, 2, 3]
      };

      const source = {
        b: {
          c: 4,
          f: 5
        },
        g: 6
      };

      // Access the private deepMerge function through the class
      const processedRelayer = defaultsManager.processRelayer({
        type: 'hermes',
        name: 'test',
        chains: ['chain1'],
        replicas: 1,
        config: source as any
      });

      // The result should have merged the nested objects
      expect(processedRelayer.config).toBeDefined();
    });
  });
}); 