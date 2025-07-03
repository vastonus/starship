import { StarshipConfig } from '@starship-ci/types';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { resolve } from 'path';

import { GeneratorConfig } from '../../src/types';

const resolvePath = (filename: string) =>
  filename.startsWith('/') ? filename : resolve((process.cwd(), filename));

export const loadConfig = (
  filename: string,
  configDir: string
): GeneratorConfig => {
  const path = resolvePath(filename);
  const fileContents = readFileSync(path, 'utf8');
  const config = yaml.load(fileContents) as StarshipConfig;
  return { ...config, configDir: configDir };
};
