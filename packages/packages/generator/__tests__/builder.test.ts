import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

import { BuilderManager } from '../src/builders';
import {
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
    
    files.forEach(filePath => {
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
        .filter(item => item.isDirectory())
        .map(item => item.name)
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
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .sort();
      
      expect(directories).toMatchSnapshot('multi-chain-directory-structure');
      
      // Verify each chain directory has the correct files
      const chainDirectories = directories.filter(dir => 
        dir !== 'configmaps' && dir !== 'explorer' && dir !== 'registry'
      );
      
      const chainStructure: Record<string, string[]> = {};
      chainDirectories.forEach(chainDir => {
        const chainPath = join(testSubDir, chainDir);
        const chainFiles = readdirSync(chainPath)
          .filter(file => file.endsWith('.yaml'))
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
      files.forEach(filePath => {
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
      Object.keys(fileStructure).forEach(dir => {
        fileStructure[dir].sort();
      });
      
      expect(fileStructure).toMatchSnapshot('file-organization-structure');
      
      // Verify chain directories don't have redundant prefixes
      const chainDirs = Object.keys(fileStructure).filter(dir => 
        !['configmaps', 'explorer', 'registry'].includes(dir)
      );
      
      chainDirs.forEach(chainDir => {
        const files = fileStructure[chainDir];
        // Chain files should have role-kind pattern (e.g., genesis-service.yaml)
        files.forEach(file => {
          if (file.includes('service') || file.includes('statefulset')) {
            expect(file).toMatch(/^(genesis|validator)-(service|statefulset)\.yaml$/);
          }
        });
      });
      
      // Verify component directories have clean names (no redundant prefixes)
      ['explorer', 'registry'].forEach(component => {
        if (fileStructure[component]) {
          const files = fileStructure[component];
          files.forEach(file => {
            // Should not have component prefix (e.g., should be 'service.yaml', not 'explorer-service.yaml')
            expect(file).not.toMatch(new RegExp(`^${component}-`));
          });
        }
      });
      
      // Verify configmaps directory has clean names (no redundant suffixes)
      if (fileStructure['configmaps']) {
        const files = fileStructure['configmaps'];
        files.forEach(file => {
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
          expect(content.metadata.labels['app.kubernetes.io/component']).toBe('chain');
          // Only check starship.io/chain-name for Services and StatefulSets (not ConfigMaps)
          if (content.kind === 'Service' || content.kind === 'StatefulSet') {
            expect(content.metadata.labels['starship.io/chain-name']).toBeDefined();
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
}); 