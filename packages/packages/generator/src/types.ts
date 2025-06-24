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

export interface EnvVar {
  name: string;
  value: string | { valueFrom: any };
}

export interface KubernetesManifest {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: any;
  data?: any;
}

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
