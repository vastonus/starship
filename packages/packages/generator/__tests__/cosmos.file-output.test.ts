import { CosmosBuilder } from '../src/cosmos';
import { GeneratorContext } from '../src/types';
import { 
  singleChainConfig, 
  multiValidatorConfig, 
  twoChainConfig,
  outputDir 
} from './test-utils/config';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('CosmosBuilder File Output Tests', () => {
  const testOutputDir = join(outputDir, 'file-output-tests');

  beforeEach(() => {
    mkdirSync(testOutputDir, { recursive: true });
  });

  describe('Direct Builder File Output', () => {
    it('should generate files using constructor outputDir', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const outputPath = join(testOutputDir, 'single-chain-constructor-outputdir');
      const builder = new CosmosBuilder(context, outputPath);
      
      const chain = singleChainConfig.chains[0];
      builder.generateFiles(chain);
      
      // Check that files were created
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'osmosis', 'genesis.yaml'))).toBe(true);
    });

    it('should generate files using method outputDir parameter', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);
      
      const chain = singleChainConfig.chains[0];
      const methodOutputDir = join(testOutputDir, 'single-chain-method-outputdir');
      builder.generateFiles(chain, methodOutputDir);
      
      // Check that files were created in the method-specified directory
      expect(existsSync(join(methodOutputDir, 'osmosis'))).toBe(true);
      expect(existsSync(join(methodOutputDir, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(methodOutputDir, 'osmosis', 'service.yaml'))).toBe(true);
      expect(existsSync(join(methodOutputDir, 'osmosis', 'genesis.yaml'))).toBe(true);
    });

    it('should generate all files', () => {
      const context: GeneratorContext = { config: twoChainConfig };
      const outputPath = join(testOutputDir, 'two-chains-generate-all');
      const builder = new CosmosBuilder(context, outputPath);
      
      builder.generateAllFiles();
      
      // Check that both chains have files
      expect(existsSync(join(outputPath, 'osmosis'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub'))).toBe(true);
      
      // Check specific files
      expect(existsSync(join(outputPath, 'osmosis', 'configmap.yaml'))).toBe(true);
      expect(existsSync(join(outputPath, 'cosmoshub', 'configmap.yaml'))).toBe(true);
    });

    it('should throw error when no output directory provided', () => {
      const context: GeneratorContext = { config: singleChainConfig };
      const builder = new CosmosBuilder(context);
      
      const chain = singleChainConfig.chains[0];
      
      expect(() => {
        builder.generateFiles(chain);
      }).toThrow('Output directory must be provided either in constructor or method call');
    });

    it('should generate different files for single vs multi-validator chains', () => {
      // Single validator chain
      const singleContext: GeneratorContext = { config: singleChainConfig };
      const singleBuilder = new CosmosBuilder(singleContext);
      const singleOutputDir = join(testOutputDir, 'single-validator-chain');
      singleBuilder.generateFiles(singleChainConfig.chains[0], singleOutputDir);
      
      // Multi validator chain
      const multiContext: GeneratorContext = { config: multiValidatorConfig };
      const multiBuilder = new CosmosBuilder(multiContext);
      const multiOutputDir = join(testOutputDir, 'multi-validator-chain');
      multiBuilder.generateFiles(multiValidatorConfig.chains[0], multiOutputDir);
      
      // Single validator should not have validator.yaml
      expect(existsSync(join(singleOutputDir, 'osmosis', 'validator.yaml'))).toBe(false);
      
      // Multi validator should have validator.yaml
      expect(existsSync(join(multiOutputDir, 'osmosis', 'validator.yaml'))).toBe(true);
    });

    describe('YAML Content Snapshots', () => {
      it('should generate valid YAML content - snapshots', () => {
        const context: GeneratorContext = { config: singleChainConfig };
        const outputPath = join(testOutputDir, 'yaml-validation-test');
        const builder = new CosmosBuilder(context, outputPath);
        
        const chain = singleChainConfig.chains[0];
        builder.generateFiles(chain);
        
        // Read and validate YAML files
        const configMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
        const serviceYaml = readFileSync(join(outputPath, 'osmosis', 'service.yaml'), 'utf-8');
        const genesisYaml = readFileSync(join(outputPath, 'osmosis', 'genesis.yaml'), 'utf-8');
        
        // Parse YAML to ensure it's valid
        const configMaps = yaml.loadAll(configMapYaml);
        const services = yaml.loadAll(serviceYaml);
        const genesis = yaml.loadAll(genesisYaml);
        
        // Manual checks
        expect(configMaps.length).toBeGreaterThan(0);
        expect(services.length).toBeGreaterThan(0);
        expect(genesis.length).toBeGreaterThan(0);
        
        // Verify content structure
        const firstConfigMap = configMaps[0] as any;
        expect(firstConfigMap.kind).toBe('ConfigMap');
        expect(firstConfigMap.metadata.name).toContain('osmosis');
        
        const firstService = services[0] as any;
        expect(firstService.kind).toBe('Service');
        expect(firstService.metadata.name).toContain('osmosis');
        
        const firstGenesis = genesis[0] as any;
        expect(firstGenesis.kind).toBe('StatefulSet');
        expect(firstGenesis.metadata.name).toContain('genesis');
        
        // Snapshot tests for generated YAML content
        expect(configMapYaml).toMatchSnapshot('single-chain-configmap-yaml');
        expect(serviceYaml).toMatchSnapshot('single-chain-service-yaml');
        expect(genesisYaml).toMatchSnapshot('single-chain-genesis-yaml');
      });

      it('should generate valid multi-validator YAML content - snapshots', () => {
        const context: GeneratorContext = { config: multiValidatorConfig };
        const outputPath = join(testOutputDir, 'multi-validator-yaml-validation');
        const builder = new CosmosBuilder(context, outputPath);
        
        const chain = multiValidatorConfig.chains[0];
        builder.generateFiles(chain);
        
        // Read YAML files
        const configMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
        const serviceYaml = readFileSync(join(outputPath, 'osmosis', 'service.yaml'), 'utf-8');
        const genesisYaml = readFileSync(join(outputPath, 'osmosis', 'genesis.yaml'), 'utf-8');
        const validatorYaml = readFileSync(join(outputPath, 'osmosis', 'validator.yaml'), 'utf-8');
        
        // Manual checks
        expect(configMapYaml).toBeDefined();
        expect(serviceYaml).toBeDefined();
        expect(genesisYaml).toBeDefined();
        expect(validatorYaml).toBeDefined();
        
        // Snapshot tests
        expect(configMapYaml).toMatchSnapshot('multi-validator-configmap-yaml');
        expect(serviceYaml).toMatchSnapshot('multi-validator-service-yaml');
        expect(genesisYaml).toMatchSnapshot('multi-validator-genesis-yaml');
        expect(validatorYaml).toMatchSnapshot('multi-validator-validator-yaml');
      });

      it('should generate two-chain YAML content - snapshots', () => {
        const context: GeneratorContext = { config: twoChainConfig };
        const outputPath = join(testOutputDir, 'two-chain-yaml-snapshots');
        const builder = new CosmosBuilder(context, outputPath);
        
        builder.generateAllFiles();
        
        // Read osmosis files
        const osmosisConfigMapYaml = readFileSync(join(outputPath, 'osmosis', 'configmap.yaml'), 'utf-8');
        const osmosisServiceYaml = readFileSync(join(outputPath, 'osmosis', 'service.yaml'), 'utf-8');
        
        // Read cosmoshub files
        const cosmoshubConfigMapYaml = readFileSync(join(outputPath, 'cosmoshub', 'configmap.yaml'), 'utf-8');
        const cosmoshubServiceYaml = readFileSync(join(outputPath, 'cosmoshub', 'service.yaml'), 'utf-8');
        
        // Manual checks
        expect(osmosisConfigMapYaml).toBeDefined();
        expect(cosmoshubConfigMapYaml).toBeDefined();
        
        // Snapshot tests
        expect(osmosisConfigMapYaml).toMatchSnapshot('two-chain-osmosis-configmap-yaml');
        expect(osmosisServiceYaml).toMatchSnapshot('two-chain-osmosis-service-yaml');
        expect(cosmoshubConfigMapYaml).toMatchSnapshot('two-chain-cosmoshub-configmap-yaml');
        expect(cosmoshubServiceYaml).toMatchSnapshot('two-chain-cosmoshub-service-yaml');
      });
    });
  });
}); 