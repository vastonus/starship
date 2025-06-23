import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

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

describe('BuilderManager Tests', () => {
  const testOutputDir = join(outputDir, 'builder-tests');

  beforeEach(() => {
    if (!existsSync(testOutputDir)) {
      mkdirSync(testOutputDir, { recursive: true });
    }
  });

  const getAllYamlFiles = (dir: string): string[] => {
    const files: string[] = [];
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...getAllYamlFiles(fullPath));
      } else if (item.name.endsWith('.yaml')) {
        files.push(fullPath);
      }
    }
    return files;
  };

  const loadYamlFiles = (dir: string): Record<string, any> => {
    const yamlFiles: Record<string, any> = {};
    const files = getAllYamlFiles(dir);

    files.forEach((filePath) => {
      const relativePath = filePath.replace(dir + '/', '');
      const content = readFileSync(filePath, 'utf-8');
      yamlFiles[relativePath] = yaml.load(content);
    });

    return yamlFiles;
  };

  describe('Single Chain Generation', () => {
    it('should generate complete single-chain setup with proper directory organization', () => {
      const manager = new BuilderManager(singleChainConfig);

      const testSubDir = join(testOutputDir, 'single-chain');
      manager.build(testSubDir);

      // Verify files were generated
      const files = getAllYamlFiles(testSubDir);
      expect(files.length).toBeGreaterThan(0);

      // Load and snapshot all YAML files
      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('single-chain-yaml-files');

      // Verify directory structure
      const directories = readdirSync(testSubDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();

      expect(directories).toMatchSnapshot('single-chain-directory-structure');
    });
  });

  describe('Multi Chain Generation', () => {
    it('should generate complete multi-chain setup with proper directory organization', () => {
      const manager = new BuilderManager(twoChainConfig);

      const testSubDir = join(testOutputDir, 'multi-chain');
      manager.build(testSubDir);

      // Verify files were generated
      const files = getAllYamlFiles(testSubDir);
      expect(files.length).toBeGreaterThan(0);

      // Load and snapshot all YAML files
      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('multi-chain-yaml-files');

      // Verify directory structure
      const directories = readdirSync(testSubDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();

      expect(directories).toMatchSnapshot('multi-chain-directory-structure');

      // Verify each chain directory has the correct files
      const chainDirectories = directories.filter(
        (dir) =>
          dir !== 'configmaps' && dir !== 'explorer' && dir !== 'registry'
      );

      const chainStructure: Record<string, string[]> = {};
      chainDirectories.forEach((chainDir) => {
        const chainPath = join(testSubDir, chainDir);
        const chainFiles = readdirSync(chainPath)
          .filter((file) => file.endsWith('.yaml'))
          .sort();
        chainStructure[chainDir] = chainFiles;
      });

      expect(chainStructure).toMatchSnapshot('chain-directory-contents');
    });
  });

  describe('Directory Organization Validation', () => {
    it('should organize files with correct naming patterns', () => {
      const manager = new BuilderManager(twoChainConfig);

      const testSubDir = join(testOutputDir, 'organization-validation');
      manager.build(testSubDir);

      const files = getAllYamlFiles(testSubDir);

      // Group files by their directory and analyze naming patterns
      const fileStructure: Record<string, string[]> = {};
      files.forEach((filePath) => {
        const relativePath = filePath.replace(testSubDir + '/', '');
        const parts = relativePath.split('/');
        const directory = parts[0];
        const fileName = parts[parts.length - 1];

        if (!fileStructure[directory]) {
          fileStructure[directory] = [];
        }
        fileStructure[directory].push(fileName);
      });

      // Sort for consistent snapshots
      Object.keys(fileStructure).forEach((dir) => {
        fileStructure[dir].sort();
      });

      expect(fileStructure).toMatchSnapshot('file-organization-structure');

      // Verify chain directories don't have redundant prefixes
      const chainDirs = Object.keys(fileStructure).filter(
        (dir) => !['configmaps', 'explorer', 'registry'].includes(dir)
      );

      chainDirs.forEach((chainDir) => {
        const files = fileStructure[chainDir];
        // Chain files should have role-kind pattern (e.g., genesis-service.yaml)
        files.forEach((file) => {
          if (file.includes('service') || file.includes('statefulset')) {
            expect(file).toMatch(
              /^(genesis|validator)-(service|statefulset)\.yaml$/
            );
          }
        });
      });

      // Verify component directories have clean names (no redundant prefixes)
      ['explorer', 'registry'].forEach((component) => {
        if (fileStructure[component]) {
          const files = fileStructure[component];
          files.forEach((file) => {
            // Should not have component prefix (e.g., should be 'service.yaml', not 'explorer-service.yaml')
            expect(file).not.toMatch(new RegExp(`^${component}-`));
          });
        }
      });

      // Verify configmaps directory has clean names (no redundant suffixes)
      if (fileStructure['configmaps']) {
        const files = fileStructure['configmaps'];
        files.forEach((file) => {
          // Should not have -configmap suffix (e.g., should be 'keys.yaml', not 'keys-configmap.yaml')
          expect(file).not.toMatch(/-configmap\.yaml$/);
        });
      }
    });
  });

  describe('File Content Validation', () => {
    it('should generate valid YAML with correct resource types', () => {
      const manager = new BuilderManager(singleChainConfig);

      const testSubDir = join(testOutputDir, 'content-validation');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);

      // Verify all files are valid YAML and have expected structure
      Object.entries(yamlFiles).forEach(([filePath, content]) => {
        expect(content).toBeDefined();
        expect(content.apiVersion).toBeDefined();
        expect(content.kind).toBeDefined();
        expect(content.metadata).toBeDefined();
        expect(content.metadata.name).toBeDefined();

        // Verify labels exist for chain components
        if (filePath.includes('osmosis/') || filePath.includes('cosmoshub/')) {
          expect(content.metadata.labels).toBeDefined();
          expect(content.metadata.labels['app.kubernetes.io/component']).toBe(
            'chain'
          );
          // Only check starship.io/chain-name for Services and StatefulSets (not ConfigMaps)
          if (content.kind === 'Service' || content.kind === 'StatefulSet') {
            expect(
              content.metadata.labels['starship.io/chain-name']
            ).toBeDefined();
          }
        }
      });

      // Count resources by type
      const resourceCounts: Record<string, number> = {};
      Object.values(yamlFiles).forEach((content: any) => {
        const kind = content.kind;
        resourceCounts[kind] = (resourceCounts[kind] || 0) + 1;
      });

      expect(resourceCounts).toMatchSnapshot('resource-type-counts');
    });
  });

  describe('Advanced Configuration Testing', () => {
    it('should handle build-enabled chain configuration', () => {
      const manager = new BuilderManager(buildChainConfig);

      const testSubDir = join(testOutputDir, 'build-chain');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('build-chain-yaml-files');

      // Verify StatefulSets have build-related init containers
      Object.values(yamlFiles).forEach((content: any) => {
        if (content.kind === 'StatefulSet') {
          const initContainers =
            content.spec?.template?.spec?.initContainers || [];
          const hasBuildContainer = initContainers.some(
            (container: any) => container.name === 'init-build-images'
          );
          expect(hasBuildContainer).toBe(true);
        }
      });
    });

    it('should handle CosmJS faucet configuration', () => {
      const manager = new BuilderManager(cosmjsFaucetConfig);

      const testSubDir = join(testOutputDir, 'cosmjs-faucet');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('cosmjs-faucet-yaml-files');

      // Verify StatefulSets have faucet containers
      Object.values(yamlFiles).forEach((content: any) => {
        if (
          content.kind === 'StatefulSet' &&
          content.metadata.name.includes('genesis')
        ) {
          const containers = content.spec?.template?.spec?.containers || [];
          const hasFaucetContainer = containers.some(
            (container: any) => container.name === 'faucet'
          );
          expect(hasFaucetContainer).toBe(true);
        }
      });
    });

    it('should handle Cometmock configuration', () => {
      const manager = new BuilderManager(cometmockConfig);

      const testSubDir = join(testOutputDir, 'cometmock');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('cometmock-yaml-files');

      // Verify cosmoshub chain is generated (cometmock config uses cosmoshub)
      const hasCosmoshubResources = Object.keys(yamlFiles).some((filePath) =>
        filePath.includes('cosmoshub/')
      );
      expect(hasCosmoshubResources).toBe(true);
    });

    it('should skip Ethereum chains appropriately', () => {
      const manager = new BuilderManager(ethereumConfig);

      const testSubDir = join(testOutputDir, 'ethereum-skip');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('ethereum-skip-yaml-files');

      // only explorer and registry dir should exist
      const directories = readdirSync(testSubDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();
      expect(directories).toEqual(['explorer', 'registry']);
    });

    it('should handle relayer configuration', () => {
      const relayerConfig = {
        name: 'relayer-testnet',
        chains: [
          {
            id: 'osmosis-1',
            name: 'osmosis' as const,
            numValidators: 1,
            prefix: 'osmo',
            denom: 'uosmo'
          },
          {
            id: 'cosmoshub-4',
            name: 'cosmoshub' as const,
            numValidators: 1,
            prefix: 'cosmos',
            denom: 'uatom'
          }
        ],
        relayers: [
          {
            name: 'hermes-relay',
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
          },
          {
            name: 'go-relay',
            type: 'go-relayer' as const,
            replicas: 1,
            chains: ['osmosis-1', 'cosmoshub-4']
          }
        ]
      };

      const manager = new BuilderManager(relayerConfig);

      const testSubDir = join(testOutputDir, 'relayers');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('relayers-yaml-files');

      // Verify relayer directory exists
      const directories = readdirSync(testSubDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();
      expect(directories).toContain('relayer');

      // Verify relayer manifests are generated
      const relayerFiles = Object.keys(yamlFiles).filter((f) =>
        f.startsWith('relayer/')
      );
      expect(relayerFiles.length).toBeGreaterThan(0);

      // Verify both relayers have their manifests
      const hermesManifests = Object.keys(yamlFiles).filter((f) =>
        f.includes('hermes-relay')
      );
      const goRelayerManifests = Object.keys(yamlFiles).filter((f) =>
        f.includes('go-relay')
      );

      expect(hermesManifests.length).toBeGreaterThan(0);
      expect(goRelayerManifests.length).toBeGreaterThan(0);

      // Verify hermes has service (go-relayer should not)
      const hermesServiceExists = Object.values(yamlFiles).some((content: any) =>
        content.kind === 'Service' && content.metadata.name.includes('hermes-relay')
      );
      const goRelayerServiceExists = Object.values(yamlFiles).some((content: any) =>
        content.kind === 'Service' && content.metadata.name.includes('go-relay')
      );

      expect(hermesServiceExists).toBe(true);
      expect(goRelayerServiceExists).toBe(false);
    });
  });

  describe('Complex Configuration Scenarios', () => {
    it('should handle configuration with all builders enabled', () => {
      const fullConfig = {
        name: 'full-testnet',
        chains: [singleChainConfig.chains[0]],
        registry: {
          enabled: true,
          image: 'registry:latest',
          ports: { rest: 8080 }
        },
        explorer: {
          enabled: true,
          type: 'ping-pub' as const,
          image: 'explorer:latest',
          ports: { rest: 8081 }
        }
      };

      const manager = new BuilderManager(fullConfig);

      const testSubDir = join(testOutputDir, 'full-builders');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('full-builders-yaml-files');

      // Verify all expected directories exist
      const directories = readdirSync(testSubDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();

      expect(directories).toEqual([
        'configmaps',
        'explorer',
        'osmosis',
        'registry'
      ]);

      // Verify each component has correct files
      const registryFiles = Object.keys(yamlFiles).filter((f) =>
        f.startsWith('registry/')
      );
      const explorerFiles = Object.keys(yamlFiles).filter((f) =>
        f.startsWith('explorer/')
      );
      const osmosisFiles = Object.keys(yamlFiles).filter((f) =>
        f.startsWith('osmosis/')
      );

      expect(registryFiles.length).toBeGreaterThan(0);
      expect(explorerFiles.length).toBeGreaterThan(0);
      expect(osmosisFiles.length).toBeGreaterThan(0);
    });
  });

  describe('File Organization Edge Cases', () => {
    it('should handle chains with special characters in names', () => {
      const specialConfig = {
        name: 'special-testnet',
        chains: [
          {
            ...singleChainConfig.chains[0],
            name: 'test-chain' as any,
            id: 'test-chain-1'
          }
        ]
      };

      const manager = new BuilderManager(specialConfig);

      const testSubDir = join(testOutputDir, 'special-chars');
      manager.build(testSubDir);

      const yamlFiles = loadYamlFiles(testSubDir);
      expect(yamlFiles).toMatchSnapshot('special-chars-yaml-files');

      // Verify directory uses chain name correctly
      const directories = readdirSync(testSubDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      expect(directories).toContain('test-chain');
    });

    it('should validate file naming consistency across all configurations', () => {
      const configs = [
        { name: 'single', config: singleChainConfig },
        { name: 'multi', config: twoChainConfig },
        { name: 'build', config: buildChainConfig },
        { name: 'cosmjs', config: cosmjsFaucetConfig },
        { name: 'cometmock', config: cometmockConfig }
      ];

      const allFileStructures: Record<string, Record<string, string[]>> = {};

      configs.forEach(({ name, config }) => {
        const manager = new BuilderManager(config);
        const testSubDir = join(testOutputDir, `consistency-${name}`);
        manager.build(testSubDir);

        const files = getAllYamlFiles(testSubDir);
        const fileStructure: Record<string, string[]> = {};

        files.forEach((filePath) => {
          const relativePath = filePath.replace(testSubDir + '/', '');
          const parts = relativePath.split('/');
          const directory = parts[0];
          const fileName = parts[parts.length - 1];

          if (!fileStructure[directory]) {
            fileStructure[directory] = [];
          }
          fileStructure[directory].push(fileName);
        });

        Object.keys(fileStructure).forEach((dir) => {
          fileStructure[dir].sort();
        });

        allFileStructures[name] = fileStructure;
      });

      expect(allFileStructures).toMatchSnapshot('all-config-file-structures');
    });
  });
});
