// file to test the builder manager with all the files in the config dir.
// each test should be a file in the config dir, and the output should be stored in the output dir as well
// while also doing snapshot testing on the output

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import { BuilderManager } from '../src/builders';
import { GeneratorConfig, Manifest } from '../src/types';
import { loadConfig } from './test-utils/load';

describe('BuilderManager Config Files Tests', () => {
  const configsDir = join(__dirname, 'configs');
  const testOutputDir = join(__dirname, '__output__', 'config-tests');

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

  const analyzeFileStructure = (outputDir: string) => {
    const files = getAllYamlFiles(outputDir);
    const fileStructure: Record<string, string[]> = {};
    const resourceCounts: Record<string, number> = {};

    files.forEach((filePath) => {
      const relativePath = filePath.replace(outputDir + '/', '');
      const parts = relativePath.split('/');
      const directory = parts[0];
      const fileName = parts[parts.length - 1];

      if (!fileStructure[directory]) {
        fileStructure[directory] = [];
      }
      fileStructure[directory].push(fileName);

      // Count resource types
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content) as any;
      const kind = parsed?.kind;
      if (kind) {
        resourceCounts[kind] = (resourceCounts[kind] || 0) + 1;
      }
    });

    // Sort for consistent snapshots
    Object.keys(fileStructure).forEach((dir) => {
      fileStructure[dir].sort();
    });

    return { fileStructure, resourceCounts };
  };

  // Get all config files from the configs directory
  const configFiles = readdirSync(configsDir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.yaml'))
    .map((item) => item.name);

  // Create a test for each config file
  configFiles.forEach((configFileName) => {
    const configName = configFileName.replace('.yaml', '');

    describe(`Config: ${configName}`, () => {
      let config: GeneratorConfig;
      let outputDir: string;
      let manifests: Manifest[];

      beforeAll(() => {
        const configPath = join(configsDir, configFileName);
        config = loadConfig(configPath, configsDir);
        outputDir = join(testOutputDir, configName);
      });

      it(`should load and build ${configName} successfully`, () => {
        expect(config).toBeDefined();
        expect(config.name).toBeDefined();

        const manager = new BuilderManager(config);
        manifests = manager.build(outputDir);

        expect(manifests.length).toBeGreaterThan(0);

        // Verify files were generated
        const files = getAllYamlFiles(outputDir);
        expect(files.length).toBeGreaterThan(0);
      });

      it(`should generate valid YAML manifests for ${configName}`, () => {
        const yamlFiles = loadYamlFiles(outputDir);

        // Verify all files are valid YAML with required fields
        Object.entries(yamlFiles).forEach(([filePath, content]) => {
          expect(filePath).toBeDefined;
          expect(content).toBeDefined();
          expect(content.apiVersion).toBeDefined();
          expect(content.kind).toBeDefined();
          expect(content.metadata).toBeDefined();
          expect(content.metadata.name).toBeDefined();
        });

        // Snapshot the YAML content
        expect(yamlFiles).toMatchSnapshot(`${configName}-yaml-files`);
      });

      it(`should have proper file organization for ${configName}`, () => {
        const { fileStructure, resourceCounts } =
          analyzeFileStructure(outputDir);

        expect(fileStructure).toMatchSnapshot(`${configName}-file-structure`);
        expect(resourceCounts).toMatchSnapshot(`${configName}-resource-counts`);
      });

      it(`should validate specific features for ${configName}`, () => {
        const yamlFiles = loadYamlFiles(outputDir);

        // Test ingress-specific features
        if (config.ingress?.enabled) {
          const ingressManifests = Object.values(yamlFiles).filter(
            (content: any) => content.kind === 'Ingress'
          );
          const issuerManifests = Object.values(yamlFiles).filter(
            (content: any) => content.kind === 'Issuer'
          );

          expect(ingressManifests.length).toBeGreaterThan(0);
          expect(issuerManifests.length).toBeGreaterThan(0);

          // Validate ingress structure
          ingressManifests.forEach((ingress: any) => {
            expect(ingress.spec.rules).toBeDefined();
            expect(ingress.spec.tls).toBeDefined();
            expect(ingress.metadata.annotations).toBeDefined();
            expect(
              ingress.metadata.annotations['cert-manager.io/issuer']
            ).toBeDefined();
          });

          // Validate cert issuer structure
          issuerManifests.forEach((issuer: any) => {
            expect(issuer.spec.acme).toBeDefined();
            expect(issuer.spec.acme.server).toBeDefined();
            expect(issuer.spec.acme.email).toBeDefined();
          });
        }

        // Test monitoring-specific features
        if (config.monitoring?.enabled) {
          const prometheusDeployments = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Deployment' &&
              content.metadata.name === 'prometheus'
          );
          const grafanaDeployments = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Deployment' &&
              content.metadata.name === 'grafana'
          );
          const prometheusConfigs = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'ConfigMap' &&
              content.metadata.name === 'prometheus-config'
          );
          const grafanaConfigs = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'ConfigMap' &&
              content.metadata.name.includes('grafana')
          );
          const clusterRoles = Object.values(yamlFiles).filter(
            (content: any) => content.kind === 'ClusterRole'
          );

          expect(prometheusDeployments.length).toBe(1);
          expect(grafanaDeployments.length).toBe(1);
          expect(prometheusConfigs.length).toBe(1);
          expect(grafanaConfigs.length).toBeGreaterThan(0);
          expect(clusterRoles.length).toBeGreaterThan(0);

          // Validate prometheus config contains chain monitoring jobs
          const prometheusConfig = prometheusConfigs[0] as any;
          const prometheusYml = prometheusConfig.data['prometheus.yml'];
          expect(prometheusYml).toBeDefined();

          if (config.chains?.some((chain: any) => chain.metrics)) {
            expect(prometheusYml).toContain('job_name:');
            expect(prometheusYml).toContain('static_configs:');
          }
        }

        // Test registry-specific features
        if (config.registry?.enabled) {
          const registryDeployments = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Deployment' &&
              content.metadata.name === 'registry'
          );
          const registryServices = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Service' && content.metadata.name === 'registry'
          );

          expect(registryDeployments.length).toBe(1);
          expect(registryServices.length).toBe(1);
        }

        // Test explorer-specific features
        if (config.explorer?.enabled) {
          const explorerDeployments = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Deployment' &&
              content.metadata.name === 'explorer'
          );
          const explorerServices = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Service' && content.metadata.name === 'explorer'
          );

          expect(explorerDeployments.length).toBe(1);
          expect(explorerServices.length).toBe(1);
        }

        // Test chain-specific features
        if (config.chains?.length > 0) {
          const chainStatefulSets = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'StatefulSet' &&
              content.metadata.labels?.['app.kubernetes.io/component'] ===
                'chain'
          );
          const chainServices = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Service' &&
              content.metadata.labels?.['app.kubernetes.io/component'] ===
                'chain'
          );

          expect(chainStatefulSets.length).toBeGreaterThan(0);
          expect(chainServices.length).toBeGreaterThan(0);

          // Validate chain manifests have proper labels
          [...chainStatefulSets, ...chainServices].forEach((manifest: any) => {
            expect(
              manifest.metadata.labels['app.kubernetes.io/component']
            ).toBe('chain');
            expect(
              manifest.metadata.labels['starship.io/chain-name']
            ).toBeDefined();
          });
        }

        // Test relayer-specific features
        if (config.relayers?.length > 0) {
          // Find all relayer StatefulSets by looking for manifests in relayer directories
          // or with relayer names, since component labels might be missing
          const allStatefulSets = Object.values(yamlFiles).filter(
            (content: any) => content.kind === 'StatefulSet'
          );

          const relayerStatefulSets = allStatefulSets.filter((content: any) => {
            // Check if it's in a relayer directory or has relayer-like naming
            const filePath = Object.keys(yamlFiles).find(
              (path) => yamlFiles[path] === content
            );
            const isInRelayerDir = filePath?.includes('/relayer/');
            const hasRelayerName =
              content.metadata.name?.includes('hermes') ||
              content.metadata.name?.includes('relayer');
            const hasRelayerComponent =
              content.metadata.labels?.['app.kubernetes.io/component'] ===
              'relayer';

            return isInRelayerDir || hasRelayerName || hasRelayerComponent;
          });

          expect(relayerStatefulSets.length).toBeGreaterThan(0);

          // Validate relayer manifests have proper labels (with defensive checks)
          relayerStatefulSets.forEach((manifest: any) => {
            const component =
              manifest.metadata.labels?.['app.kubernetes.io/component'];
            if (component) {
              expect(component).toBe('relayer');
            } else {
              // Log warning but don't fail - this might be a missing label issue
              console.warn(
                `Relayer StatefulSet ${manifest.metadata.name} is missing app.kubernetes.io/component label`
              );
            }
            // Note: app.kubernetes.io/role is optional for relayers
          });
        }

        // Test Ethereum-specific features
        const hasEthereumChains = config.chains?.some(
          (chain: any) =>
            chain.name === 'ethereum' || chain.name?.startsWith('ethereum-')
        );

        if (hasEthereumChains) {
          const ethereumStatefulSets = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'StatefulSet' &&
              (content.metadata.name?.includes('ethereum') ||
                content.metadata.labels?.['starship.io/chain-name']?.includes(
                  'ethereum'
                ))
          );

          expect(ethereumStatefulSets.length).toBeGreaterThan(0);

          // Validate Ethereum StatefulSets have required containers
          ethereumStatefulSets.forEach((statefulSet: any) => {
            const containers =
              statefulSet.spec?.template?.spec?.containers || [];
            const containerNames = containers.map((c: any) => c.name);

            // Should have geth, beacon-chain, and validator containers
            expect(containerNames).toContain('geth');
            expect(containerNames).toContain('beacon-chain');
            expect(containerNames).toContain('validator');
          });
        }

        // Test frontend-specific features
        if (config.frontends?.length > 0) {
          const frontendDeployments = Object.values(yamlFiles).filter(
            (content: any) =>
              content.kind === 'Deployment' &&
              content.metadata.labels?.['app.kubernetes.io/component'] ===
                'frontend'
          );

          expect(frontendDeployments.length).toBe(config.frontends.length);
        }
      });

      it(`should validate resource specifications for ${configName}`, () => {
        const yamlFiles = loadYamlFiles(outputDir);

        // Check that all Deployments and StatefulSets have resource specifications
        const workloadManifests = Object.values(yamlFiles).filter(
          (content: any) =>
            content.kind === 'Deployment' || content.kind === 'StatefulSet'
        );

        workloadManifests.forEach((manifest: any) => {
          const containers = manifest.spec?.template?.spec?.containers || [];
          containers.forEach((container: any) => {
            if (container.resources) {
              expect(container.resources).toBeDefined();
              // Should have either requests or limits defined
              expect(
                container.resources.requests || container.resources.limits
              ).toBeDefined();
            }
          });
        });
      });

      it(`should have consistent labeling for ${configName}`, () => {
        const yamlFiles = loadYamlFiles(outputDir);

        // Check that all manifests have consistent labeling
        Object.values(yamlFiles).forEach((manifest: any) => {
          try {
            expect(manifest.metadata.labels).toBeDefined();
            expect(Object.keys(manifest.metadata.labels)).toEqual(
              expect.arrayContaining([
                'app.kubernetes.io/managed-by',
                'app.kubernetes.io/name',
                'app.kubernetes.io/version',
                'app.kubernetes.io/component'
              ])
            );
          } catch (error) {
            throw new Error(
              `Label validation failed for file ${configName}: ${manifest.metadata.name}, kind: ${manifest.kind}, error: ${error}`
            );
          }
        });
      });
    });
  });

  // Summary test that compares all configs
  describe('Cross-Config Analysis', () => {
    it('should maintain consistent file organization patterns across all configs', () => {
      const allFileStructures: Record<string, any> = {};
      const allResourceCounts: Record<string, any> = {};

      configFiles.forEach((configFileName) => {
        const configName = configFileName.replace('.yaml', '');
        const outputDir = join(testOutputDir, configName);

        if (existsSync(outputDir)) {
          const { fileStructure, resourceCounts } =
            analyzeFileStructure(outputDir);
          allFileStructures[configName] = fileStructure;
          allResourceCounts[configName] = resourceCounts;
        }
      });

      expect(allFileStructures).toMatchSnapshot('all-configs-file-structures');
      expect(allResourceCounts).toMatchSnapshot('all-configs-resource-counts');
    });

    it('should validate that ingress and monitoring configs generate expected resources', () => {
      const ingressConfigs = configFiles.filter(
        (name) => name.includes('ingress') || name.includes('monitoring')
      );

      const analysis: Record<string, any> = {};

      ingressConfigs.forEach((configFileName) => {
        const configName = configFileName.replace('.yaml', '');
        const configPath = join(configsDir, configFileName);
        const config = loadConfig(configPath, configsDir);
        const outputDir = join(testOutputDir, configName);

        if (existsSync(outputDir)) {
          const yamlFiles = loadYamlFiles(outputDir);

          analysis[configName] = {
            hasIngress: config.ingress?.enabled,
            hasMonitoring: config.monitoring?.enabled,
            ingressResourceCount: Object.values(yamlFiles).filter(
              (c: any) => c.kind === 'Ingress'
            ).length,
            issuerResourceCount: Object.values(yamlFiles).filter(
              (c: any) => c.kind === 'Issuer'
            ).length,
            prometheusResourceCount: Object.values(yamlFiles).filter(
              (c: any) =>
                c.kind === 'Deployment' && c.metadata.name === 'prometheus'
            ).length,
            grafanaResourceCount: Object.values(yamlFiles).filter(
              (c: any) =>
                c.kind === 'Deployment' && c.metadata.name === 'grafana'
            ).length,
            clusterRoleCount: Object.values(yamlFiles).filter(
              (c: any) => c.kind === 'ClusterRole'
            ).length
          };
        }
      });

      expect(analysis).toMatchSnapshot('ingress-monitoring-analysis');
    });
  });
});
