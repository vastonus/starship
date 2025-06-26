import {
  Chain,
  FaucetConfig,
  Relayer,
  Script,
  StarshipConfig,
  Images,
  Resources,
  Exposer,
  TimeoutConfig,
  Explorer,
  Registry,
  Monitoring,
  Ingress
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
  images?: Images;
  resources?: {
    node: Resources;
    wait: Resources;
  };
  exposer?: Exposer;
  timeouts?: TimeoutConfig;
  explorer?: Explorer;
  registry?: Registry;
  faucet?: FaucetConfig;
  monitoring?: Monitoring;
  ingress?: Ingress;
}

export interface IGenerator {
  generate(): Array<Manifest>;
}
