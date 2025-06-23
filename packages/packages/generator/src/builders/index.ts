import { StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { CosmosBuilder } from './cosmos';
import { RegistryBuilder } from './registry';
import { ExplorerBuilder } from './explorer';
import { FrontendBuilder } from './frontend';
import { applyDefaults } from '../defaults';

export class BuilderManager {
    private config: StarshipConfig;

    constructor(config: StarshipConfig) {
        this.config = applyDefaults(config);
    }

    private writeManifests(manifests: any[], outputDir: string): void {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        manifests.forEach(manifest => {
            const filename = `${manifest.metadata.name}-${manifest.kind.toLowerCase()}.yaml`;
            const filepath = path.join(outputDir, filename);
            fs.writeFileSync(filepath, yaml.dump(manifest));
        });
    }

    build(outputDir: string): void {
        const builders = [
            new CosmosBuilder(this.config),
            new RegistryBuilder(this.config),
            new ExplorerBuilder(this.config),
            new FrontendBuilder(this.config)
        ];

        let allManifests: any[] = [];

        builders.forEach(builder => {
            // @ts-ignore
            if (builder.buildManifests) {
                 // @ts-ignore
                const manifests = builder.buildManifests();
                allManifests = allManifests.concat(manifests);
            }
        });
        
        this.writeManifests(allManifests, outputDir);
    }
} 