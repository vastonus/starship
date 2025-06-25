import {
  Chain,
  FaucetConfig,
  Relayer,
  Script,
  StarshipConfig
} from '@starship-ci/types';
import { ConfigMap, Deployment, Service, StatefulSet } from 'kubernetesjs';

export type Manifest = ConfigMap | Service | Deployment | StatefulSet;

export interface GeneratorContext {
  config: StarshipConfig;
  namespace?: string;
  version?: string;
}

// Cometmock default configuration
export interface CometmockDefault {
  image: string;
}

// Complete defaults structure from defaults.yaml
export interface DefaultsConfig {
  defaultChains: Record<string, Chain>;
  defaultFaucet: Record<string, FaucetConfig>;
  defaultRelayers: Record<string, Relayer>;
  defaultScripts: Record<string, Script>;
  defaultCometmock: CometmockDefault;
}

export interface IGenerator {
  generate(): Array<Manifest>;
}
