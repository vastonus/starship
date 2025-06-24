import { StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { applyDefaults } from '../defaults';
import { CosmosBuilder } from './cosmos';
import { ExplorerBuilder } from './explorer';
import { FrontendBuilder } from './frontend';
import { RegistryBuilder } from './registry';
import { RelayerBuilder } from './relayers';

export class BuilderManager {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = applyDefaults(config);
  }

  private getManifestOutputPath(manifest: any, baseDir: string): string {
    const labels = manifest.metadata?.labels || {};
    const component = labels['app.kubernetes.io/component'];
    const partOf = labels['app.kubernetes.io/part-of'];
    const role = labels['app.kubernetes.io/role'];
    const kind = manifest.kind.toLowerCase();
    const name = manifest.metadata.name;

    if (component === 'chain') {
      // Chain-specific resources: outputs/<chain-name>/<role>-<kind>.yaml
      // For StatefulSets, use the special chain-name label, otherwise use app.kubernetes.io/name
      const chainName =
        labels['starship.io/chain-name'] || labels['app.kubernetes.io/name'];
      const roleType = role || 'default'; // genesis, validator, setup-scripts, genesis-patch, ics-proposal
      return path.join(baseDir, chainName, `${roleType}-${kind}.yaml`);
    } else if (partOf === 'global') {
      // Global configmaps: outputs/configmaps/<clean-name>.yaml (remove redundant suffixes)
      const cleanName = name.replace(/-?configmap$/, ''); // Remove -configmap or configmap suffix
      return path.join(baseDir, 'configmaps', `${cleanName}.yaml`);
    } else if (component) {
      // Component resources: outputs/<component>/<clean-kind>.yaml (remove redundant prefixes)
      const cleanName = name.replace(new RegExp(`^${component}-?`), ''); // Remove component prefix
      const fileName = cleanName ? `${cleanName}-${kind}.yaml` : `${kind}.yaml`;
      return path.join(baseDir, component, fileName);
    } else {
      // Fallback: outputs/<name>-<kind>.yaml
      return path.join(baseDir, `${name}-${kind}.yaml`);
    }
  }

  private writeManifestToPath(manifest: any, filePath: string): void {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write YAML file
    fs.writeFileSync(filePath, yaml.dump(manifest));
  }

  private writeManifests(manifests: any[], outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    manifests.forEach((manifest) => {
      const outputPath = this.getManifestOutputPath(manifest, outputDir);
      this.writeManifestToPath(manifest, outputPath);
    });
  }

  build(outputDir: string): void {
    const builders = [
      new CosmosBuilder(this.config),
      new RegistryBuilder(this.config),
      new ExplorerBuilder(this.config),
      new FrontendBuilder(this.config),
      new RelayerBuilder(this.config)
    ];

    let allManifests: any[] = [];

    builders.forEach((builder) => {
      if (builder.buildManifests) {
        const manifests = builder.buildManifests();
        allManifests = allManifests.concat(manifests);
      }
    });

    this.writeManifests(allManifests, outputDir);
  }
}
