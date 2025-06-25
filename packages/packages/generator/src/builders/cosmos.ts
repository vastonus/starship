import { Chain, StarshipConfig } from '@starship-ci/types';
import * as fs from 'fs';
import { ConfigMap, Container, Service, StatefulSet } from 'kubernetesjs';
import * as path from 'path';

import { DefaultsManager } from '../defaults';
import { TemplateHelpers, getChainId, getHostname } from '../helpers';
import { ScriptManager } from '../scripts';
import { getGeneratorVersion } from '../version';
import { IGenerator, Manifest } from '../types';
import { CosmosServiceGenerator } from './chains/cosmos/service';

/**
 * ConfigMap generator for Cosmos chains
 * Handles scripts, genesis patches, and ICS consumer proposals
 */
export class CosmosConfigMapGenerator implements IGenerator {
  private scriptManager: ScriptManager;
  private defaultsManager: DefaultsManager;
  private config: StarshipConfig;
  private chain: Chain;

  constructor(
    chain: Chain,
    config: StarshipConfig,
    scriptManager: ScriptManager
  ) {
    this.scriptManager = scriptManager;
    this.defaultsManager = new DefaultsManager();
    this.config = config;
    this.chain = this.defaultsManager.processChain(chain);
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/component': 'chain',
      'app.kubernetes.io/part-of': getChainId(this.chain),
      'app.kubernetes.io/id': getChainId(this.chain),
      'app.kubernetes.io/name': this.chain.name,
      'app.kubernetes.io/type': `${getChainId(this.chain)}-configmap`,
    };
  }

  /**
   * Create scripts ConfigMap
   */
  scriptsConfigMap(): ConfigMap {
    const scriptsData: Record<string, string> = {};

    for (const [key, script] of Object.entries(this.chain.scripts)) {
      const scriptName = script.name || `${key}.sh`;
      scriptsData[scriptName] = this.scriptManager.getScriptContent(script);
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `setup-scripts-${getHostname(this.chain)}`,
        labels: this.labels(),
      },
      data: scriptsData,
    };
  }

  /**
   * Create genesis patch ConfigMap
   */
  genesisPatchConfigMap(): ConfigMap | null {
    if (!this.chain.genesis) return null;

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `patch-${getHostname(this.chain)}`,
        labels: this.labels(),
      },
      data: {
        'genesis.json': JSON.stringify(this.chain.genesis, null, 2),
      },
    };
  }

  /**
   * Create ICS consumer proposal ConfigMap
   */
  icsConsumerProposalConfigMap(): ConfigMap | null {
    if (!this.chain.ics?.enabled) return null;

    const icsChain = this.defaultsManager.processChain(
      this.config.chains.find((c) => c.id === this.chain.ics.provider)!
    );

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `consumer-proposal-${getHostname(this.chain)}`,
        labels: this.labels(),
      },
      data: {
        'proposal.json': JSON.stringify(
          {
            title: `Add ${this.chain.name} consumer chain`,
            summary: `Add ${this.chain.name} consumer chain with id ${getChainId(this.chain)}`,
            chain_id: getChainId(this.chain),
            initial_height: {
              revision_height: 1,
              revision_number: 1,
            },
            genesis_hash:
              'd86d756e10118e66e6805e9cc476949da2e750098fcc7634fd0cc77f57a0b2b0',
            binary_hash:
              '376cdbd3a222a3d5c730c9637454cd4dd925e2f9e2e0d0f3702fc922928583f1',
            spawn_time: '2023-02-28T20:40:00.000000Z',
            unbonding_period: 294000000000,
            ccv_timeout_period: 259920000000,
            transfer_timeout_period: 18000000000,
            consumer_redistribution_fraction: '0.75',
            blocks_per_distribution_transmission: 10,
            historical_entries: 100,
            distribution_transmission_channel: '',
            top_N: 95,
            validators_power_cap: 0,
            validator_set_cap: 0,
            allowlist: [] as string[],
            denylist: [] as string[],
            deposit: `10000${icsChain.denom}`,
          },
          null,
          2
        ),
      },
    };
  }

  generate(): Manifest[] {
    return [
      this.scriptsConfigMap(),
      this.genesisPatchConfigMap(),
      this.icsConsumerProposalConfigMap(),
    ];
  }
}

/**
 * StatefulSet generator for Cosmos chains
 * Handles genesis and validator StatefulSets with proper container and init container management
 */
export class CosmosStatefulSetGenerator implements IGenerator {
  private scriptManager: ScriptManager;
  private defaultsManager: DefaultsManager;
  private config: StarshipConfig;
  private chain: any; // Chain

  constructor(
    chain: Chain,
    config: StarshipConfig,
    scriptManager: ScriptManager
  ) {
    this.scriptManager = scriptManager;
    this.defaultsManager = new DefaultsManager();
    this.config = config;
    this.chain = this.defaultsManager.processChain(chain);
  }

  labels(): Record<string, string> {
    return {
      ...TemplateHelpers.commonLabels(this.config),
      'app.kubernetes.io/component': 'chain',
      'app.kubernetes.io/part-of': getChainId(this.chain),
      'app.kubernetes.io/id': getChainId(this.chain),
      'app.kubernetes.io/name': `${getHostname(this.chain)}-genesis`,
      'app.kubernetes.io/type': `${getChainId(this.chain)}-statefulset`,
    };
  }

  /**
   * Create StatefulSet for genesis node
   */
  genesisStatefulSet(): StatefulSet {
    return {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: `${getHostname(this.chain)}-genesis`,
        labels: {
          ...this.labels(),
          'app.kubernetes.io/role': 'genesis',
          'starship.io/chain-name': this.chain.name, // For directory organization
        },
      },
      spec: {
        serviceName: `${getHostname(this.chain)}-genesis`,
        replicas: 1,
        revisionHistoryLimit: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/instance': this.config.name,
            'app.kubernetes.io/name': `${getChainId(this.chain)}-genesis`,
          },
        },
        template: {
          metadata: {
            annotations: {
              quality: 'release',
              role: 'api-gateway',
              sla: 'high',
              tier: 'gateway',
            },
            labels: {
              'app.kubernetes.io/instance': this.config.name,
              'app.kubernetes.io/type': getChainId(this.chain),
              'app.kubernetes.io/name': `${getChainId(this.chain)}-genesis`,
              'app.kubernetes.io/rawname': getChainId(this.chain),
              'app.kubernetes.io/version': getGeneratorVersion(),
              'app.kubernetes.io/role': 'genesis',
            },
          },
          spec: {
            ...(this.chain.imagePullSecrets
              ? TemplateHelpers.generateImagePullSecrets(
                  this.chain.imagePullSecrets
                )
              : {}),
            initContainers: this.genesisInitContainers(),
            containers: this.genesisContainers(),
            volumes: TemplateHelpers.generateChainVolumes(this.chain),
          },
        },
      },
    };
  }

  /**
   * Create StatefulSet for validator nodes
   */
  validatorStatefulSet(): StatefulSet {
    return {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: `${getHostname(this.chain)}-validator`,
        labels: {
          ...this.labels(),
          'app.kubernetes.io/role': 'validator',
          'starship.io/chain-name': this.chain.name, // For directory organization
        },
      },
      spec: {
        serviceName: `${getHostname(this.chain)}-validator`,
        podManagementPolicy: 'Parallel',
        replicas: (this.chain.numValidators || 1) - 1,
        revisionHistoryLimit: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/instance': this.config.name,
            'app.kubernetes.io/name': `${getChainId(this.chain)}-validator`,
          },
        },
        template: {
          metadata: {
            annotations: {
              quality: 'release',
              role: 'api-gateway',
              sla: 'high',
              tier: 'gateway',
            },
            labels: {
              'app.kubernetes.io/instance': this.config.name,
              'app.kubernetes.io/type': getChainId(this.chain),
              'app.kubernetes.io/name': `${getChainId(this.chain)}-validator`,
              'app.kubernetes.io/version': getGeneratorVersion(),
              'app.kubernetes.io/role': 'validator',
            },
          },
          spec: {
            ...(this.chain.imagePullSecrets
              ? TemplateHelpers.generateImagePullSecrets(
                  this.chain.imagePullSecrets
                )
              : {}),
            initContainers: this.validatorInitContainers(),
            containers: this.validatorContainers(),
            volumes: TemplateHelpers.generateChainVolumes(this.chain),
          },
        },
      },
    };
  }

  generate(): Manifest[] {
    return [this.genesisStatefulSet(), this.validatorStatefulSet()];
  }

  /**
   * Create init containers for genesis node
   */
  private genesisInitContainers(): Container[] {
    const initContainers: Container[] = [];
    const exposerPort = this.config.exposer?.ports?.rest || 8081;

    // Build images init container if needed
    if (this.chain.build?.enabled || this.chain.upgrade?.enabled) {
      const buildCommands = [
        '# Install cosmovisor',
        'go install github.com/cosmos/cosmos-sdk/cosmovisor/cmd/cosmovisor@v1.0.0',
        '',
        '# Build genesis',
      ];

      if (this.chain.upgrade?.enabled) {
        // Build genesis version
        buildCommands.push(
          `UPGRADE_NAME=genesis CODE_TAG=${this.chain.upgrade.genesis} bash -e /scripts/build-chain.sh`
        );

        // Build upgrade versions
        if (this.chain.upgrade.upgrades) {
          this.chain.upgrade.upgrades.forEach((upgrade: any) => {
            buildCommands.push(
              `UPGRADE_NAME=${upgrade.name} CODE_TAG=${upgrade.version} bash -e /scripts/build-chain.sh`
            );
          });
        }
      } else if (this.chain.build?.enabled) {
        buildCommands.push(
          `UPGRADE_NAME=genesis CODE_TAG=${this.chain.build.source} bash -e /scripts/build-chain.sh`
        );
      }

      initContainers.push({
        name: 'init-build-images',
        image: 'ghcr.io/cosmology-tech/starship/builder:latest',
        imagePullPolicy: 'IfNotPresent',
        command: ['bash', '-c', buildCommands.join('\n')],
        env: [
          { name: 'CODE_REF', value: this.chain.repo },
          { name: 'UPGRADE_DIR', value: `${this.chain.home}/cosmovisor` },
          { name: 'GOBIN', value: '/go/bin' },
          { name: 'CHAIN_NAME', value: getChainId(this.chain) },
          ...TemplateHelpers.defaultEnvVars(this.chain),
        ],
        resources: TemplateHelpers.nodeResources(this.chain, this.config),
        volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
      });
    }

    // Genesis init container
    initContainers.push({
      name: 'init-genesis',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        ...TemplateHelpers.chainEnvVars(this.chain),
        ...TemplateHelpers.timeoutVars(this.config.timeouts || {}),
        { name: 'KEYS_CONFIG', value: '/configs/keys.json' },
        {
          name: 'FAUCET_ENABLED',
          value: String(this.chain.faucet?.enabled || false),
        },
        {
          name: 'NUM_VALIDATORS',
          value: String(this.chain.numValidators || 1),
        },
        {
          name: 'NUM_RELAYERS',
          value: String(this.config.relayers?.length || 0),
        },
      ],
      command: ['bash', '-c', this.genesisScript()],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
    });

    // Config init container
    initContainers.push({
      name: 'init-config',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        ...TemplateHelpers.chainEnvVars(this.chain),
        ...TemplateHelpers.timeoutVars(this.config.timeouts || {}),
        { name: 'KEYS_CONFIG', value: '/configs/keys.json' },
        { name: 'METRICS', value: String(this.chain.metrics || false) },
      ],
      command: ['bash', '-c', '/scripts/update-config.sh'],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: [
        ...TemplateHelpers.generateChainVolumeMounts(this.chain),
        ...(this.chain.genesis
          ? [
              {
                mountPath: '/patch',
                name: 'patch',
              },
            ]
          : []),
      ],
    });

    // Add additional init containers based on chain configuration
    if (this.chain.faucet?.enabled && this.chain.faucet.type === 'starship') {
      initContainers.push(this.faucetInitContainer());
    }

    if (this.chain.ics?.enabled) {
      initContainers.push(this.icsInitContainer(exposerPort));
    }

    return initContainers;
  }

  /**
   * Create main containers for genesis node
   */
  private genesisContainers(): Container[] {
    const containers: Container[] = [];

    // Main validator container
    containers.push({
      name: 'validator',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        ...TemplateHelpers.chainEnvVars(this.chain),
        {
          name: 'FAUCET_ENABLED',
          value: String(this.chain.faucet?.enabled || false),
        },
        { name: 'SLOGFILE', value: 'slog.slog' },
        ...(this.chain.env || []).map((env: any) => ({
          name: env.name,
          value: String(env.value),
        })),
      ],
      command: ['bash', '-c', this.validatorStartScript()],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
      ...(this.chain.cometmock?.enabled
        ? {}
        : {
            readinessProbe: this.chain.readinessProbe || {
              exec: {
                command: [
                  'bash',
                  '-e',
                  '/scripts/chain-rpc-ready.sh',
                  'http://localhost:26657',
                ],
              },
              initialDelaySeconds: 10,
              periodSeconds: 10,
              timeoutSeconds: 15,
            },
          }),
    });

    // Exposer container
    containers.push({
      name: 'exposer',
      image:
        this.config.exposer?.image ||
        'ghcr.io/cosmology-tech/starship/exposer:latest',
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.genesisVars(
          this.chain,
          this.config.exposer?.ports?.rest || 8081
        ),
        { name: 'EXPOSER_HTTP_PORT', value: '8081' },
        { name: 'EXPOSER_GRPC_PORT', value: '9099' },
        {
          name: 'EXPOSER_GENESIS_FILE',
          value: `${this.chain.home}/config/genesis.json`,
        },
        { name: 'EXPOSER_MNEMONIC_FILE', value: '/configs/keys.json' },
        {
          name: 'EXPOSER_PRIV_VAL_FILE',
          value: `${this.chain.home}/config/priv_validator_key.json`,
        },
        {
          name: 'EXPOSER_NODE_KEY_FILE',
          value: `${this.chain.home}/config/node_key.json`,
        },
        {
          name: 'EXPOSER_NODE_ID_FILE',
          value: `${this.chain.home}/config/node_id.json`,
        },
        {
          name: 'EXPOSER_PRIV_VAL_STATE_FILE',
          value: `${this.chain.home}/data/priv_validator_state.json`,
        },
      ],
      command: ['exposer'],
      resources: TemplateHelpers.getResourceObject(
        this.config.exposer?.resources || { cpu: '0.1', memory: '128M' }
      ),
      volumeMounts: [
        { mountPath: this.chain.home, name: 'node' },
        { mountPath: '/configs', name: 'addresses' },
      ],
    });

    // Faucet container if enabled
    if (this.chain.faucet?.enabled) {
      containers.push(this.faucetContainer());
    }

    return containers;
  }

  /**
   * Create init containers for validator nodes
   */
  private validatorInitContainers(): Container[] {
    const initContainers: Container[] = [];

    // Build images init container if needed
    if (this.chain.build?.enabled || this.chain.upgrade?.enabled) {
      const buildCommands = [
        '# Install cosmovisor',
        'go install github.com/cosmos/cosmos-sdk/cosmovisor/cmd/cosmovisor@v1.0.0',
        '',
        '# Build genesis',
      ];

      if (this.chain.upgrade?.enabled) {
        // Build genesis version
        buildCommands.push(
          `UPGRADE_NAME=genesis CODE_TAG=${this.chain.upgrade.genesis} bash -e /scripts/build-chain.sh`
        );

        // Build upgrade versions
        if (this.chain.upgrade.upgrades) {
          this.chain.upgrade.upgrades.forEach((upgrade: any) => {
            buildCommands.push(
              `UPGRADE_NAME=${upgrade.name} CODE_TAG=${upgrade.version} bash -e /scripts/build-chain.sh`
            );
          });
        }
      } else if (this.chain.build?.enabled) {
        buildCommands.push(
          `UPGRADE_NAME=genesis CODE_TAG=${this.chain.build.source} bash -e /scripts/build-chain.sh`
        );
      }

      initContainers.push({
        name: 'init-build-images',
        image: 'ghcr.io/cosmology-tech/starship/builder:latest',
        imagePullPolicy: 'IfNotPresent',
        command: ['bash', '-c', buildCommands.join('\n')],
        env: [
          { name: 'CODE_REF', value: this.chain.repo },
          { name: 'UPGRADE_DIR', value: `${this.chain.home}/cosmovisor` },
          { name: 'GOBIN', value: '/go/bin' },
          { name: 'CHAIN_NAME', value: getChainId(this.chain) },
          ...TemplateHelpers.defaultEnvVars(this.chain),
        ],
        resources: TemplateHelpers.nodeResources(this.chain, this.config),
        volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
      });
    }

    // Validator init container
    initContainers.push({
      name: 'init-validator',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        ...TemplateHelpers.chainEnvVars(this.chain),
        ...TemplateHelpers.timeoutVars(this.config.timeouts || {}),
        { name: 'KEYS_CONFIG', value: '/configs/keys.json' },
      ],
      command: ['bash', '-c', this.validatorInitScript()],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
    });

    // Validator config init container
    initContainers.push({
      name: 'init-validator-config',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        ...TemplateHelpers.chainEnvVars(this.chain),
        ...TemplateHelpers.timeoutVars(this.config.timeouts || {}),
        { name: 'KEYS_CONFIG', value: '/configs/keys.json' },
        { name: 'METRICS', value: String(this.chain.metrics || false) },
      ],
      command: ['bash', '-c', this.validatorConfigScript()],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
    });

    return initContainers;
  }

  /**
   * Create main containers for validator nodes
   */
  private validatorContainers(): Container[] {
    const containers: Container[] = [];

    // Main validator container
    containers.push({
      name: 'validator',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        ...TemplateHelpers.chainEnvVars(this.chain),
        { name: 'SLOGFILE', value: 'slog.slog' },
        ...(this.chain.env || []).map((env: any) => ({
          name: env.name,
          value: String(env.value),
        })),
      ],
      command: ['bash', '-c', this.validatorStartScript()],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
      lifecycle: {
        postStart: {
          exec: {
            command: ['bash', '-c', this.validatorPostStartScript()],
          },
        },
      },
      ...(this.chain.cometmock?.enabled
        ? {}
        : {
            readinessProbe: this.chain.readinessProbe || {
              exec: {
                command: [
                  'bash',
                  '-e',
                  '/scripts/chain-rpc-ready.sh',
                  'http://localhost:26657',
                ],
              },
              initialDelaySeconds: 10,
              periodSeconds: 10,
              timeoutSeconds: 15,
            },
          }),
    });

    return containers;
  }

  private genesisScript(): string {
    return this.scriptManager.getScriptContent(
      this.chain.scripts['create-genesis'] || {
        name: 'create-genesis.sh',
        data: '/scripts/create-genesis.sh',
      }
    );
  }

  private configScript(): string {
    return this.scriptManager.getScriptContent(
      this.chain.scripts['update-config'] || {
        name: 'update-config.sh',
        data: '/scripts/update-config.sh',
      }
    );
  }

  private validatorStartScript(): string {
    return `#!/bin/bash
set -euo pipefail

echo "Starting ${this.chain.binary} validator..."
exec ${this.chain.binary} start --home ${this.chain.home} --log_level info`;
  }

  private validatorInitScript(): string {
    return `#!/bin/bash
set -euo pipefail

echo "Initializing validator node for ${getChainId(this.chain)}..."
${this.chain.binary} init validator-\${HOSTNAME##*-} --chain-id ${getChainId(this.chain)} --home ${this.chain.home}
echo "Validator initialization completed"`;
  }

  private validatorConfigScript(): string {
    return this.scriptManager.getScriptContent(
      this.chain.scripts['update-config'] || {
        name: 'update-config.sh',
        data: '/scripts/update-config.sh',
      }
    );
  }

  private validatorPostStartScript(): string {
    return `#!/bin/bash
echo "Validator post-start hook for ${getChainId(this.chain)}"
# Add any post-start logic here`;
  }

  private faucetInitContainer(): Container {
    return {
      name: 'init-faucet',
      image: this.chain.faucet!.image,
      imagePullPolicy: 'IfNotPresent',
      command: [
        'bash',
        '-c',
        'cp /bin/faucet /faucet/faucet && chmod +x /faucet/faucet',
      ],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: [{ mountPath: '/faucet', name: 'faucet' }],
    };
  }

  private icsInitContainer(exposerPort: number): Container {
    return {
      name: 'init-ics',
      image: this.chain.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        ...TemplateHelpers.defaultEnvVars(this.chain),
        { name: 'EXPOSER_PORT', value: String(exposerPort) },
      ],
      command: [
        'bash',
        '-c',
        `echo "ICS initialization for consumer chain ${getChainId(this.chain)}"`,
      ],
      resources: TemplateHelpers.nodeResources(this.chain, this.config),
      volumeMounts: TemplateHelpers.generateChainVolumeMounts(this.chain),
    };
  }

  private faucetContainer(): Container {
    if (this.chain.faucet?.type === 'cosmjs') {
      return this.cosmjsFaucetContainer();
    }
    return this.starshipFaucetContainer();
  }

  private cosmjsFaucetContainer(): Container {
    return {
      name: 'faucet',
      image: this.chain.faucet!.image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        {
          name: 'FAUCET_CONCURRENCY',
          value: String(this.chain.faucet!.concurrency || 1),
        },
        {
          name: 'FAUCET_PORT',
          value: String(this.chain.faucet!.ports?.rest || 8000),
        },
        {
          name: 'FAUCET_GAS_PRICE',
          value: this.chain.faucet!.gasPrice || '0.025',
        },
        {
          name: 'FAUCET_PATH_PATTERN',
          value: this.chain.faucet!.pathPattern || '',
        },
        { name: 'FAUCET_ADDRESS_PREFIX', value: this.chain.prefix },
        {
          name: 'FAUCET_TOKENS',
          value: this.chain.faucet!.tokens?.join(',') || this.chain.denom,
        },
        {
          name: 'FAUCET_CREDIT_AMOUNT_SEND',
          value: String(this.chain.faucet!.creditAmount?.send || 10000000),
        },
        {
          name: 'FAUCET_CREDIT_AMOUNT_STAKE',
          value: String(this.chain.faucet!.creditAmount?.stake || 10000000),
        },
        {
          name: 'FAUCET_MAX_CREDIT',
          value: String(this.chain.faucet!.maxCredit || 99999999),
        },
        { name: 'FAUCET_MNEMONIC', value: this.chain.faucet!.mnemonic || '' },
        { name: 'FAUCET_CHAIN_ID', value: getChainId(this.chain) },
        {
          name: 'FAUCET_RPC_ENDPOINT',
          value: `http://localhost:${TemplateHelpers.getPortMap().rpc}`,
        },
      ],
      command: ['yarn', 'start'],
      resources: TemplateHelpers.getResourceObject(
        this.chain.faucet!.resources || { cpu: '0.2', memory: '200M' }
      ),
      volumeMounts: [{ mountPath: '/configs', name: 'addresses' }],
    };
  }

  private starshipFaucetContainer(): Container {
    return {
      name: 'faucet',
      image: 'busybox:1.34.1',
      imagePullPolicy: 'IfNotPresent',
      env: [
        {
          name: 'FAUCET_CONCURRENCY',
          value: String(this.chain.faucet!.concurrency || 1),
        },
        {
          name: 'FAUCET_PORT',
          value: String(this.chain.faucet!.ports?.rest || 8000),
        },
        { name: 'FAUCET_CHAIN_ID', value: getChainId(this.chain) },
        { name: 'FAUCET_CHAIN_DENOM', value: this.chain.denom },
        { name: 'FAUCET_CHAIN_PREFIX', value: this.chain.prefix },
        {
          name: 'FAUCET_AMOUNT_SEND',
          value: String(this.chain.faucet!.creditAmount?.send || 10000000),
        },
        {
          name: 'FAUCET_AMOUNT_STAKE',
          value: String(this.chain.faucet!.creditAmount?.stake || 10000000),
        },
        {
          name: 'FAUCET_RPC_ENDPOINT',
          value: `http://localhost:${TemplateHelpers.getPortMap().rpc}`,
        },
        {
          name: 'FAUCET_REST_ENDPOINT',
          value: `http://localhost:${TemplateHelpers.getPortMap().rest}`,
        },
      ],
      command: ['sh', '-c', '/faucet/faucet'],
      resources: TemplateHelpers.getResourceObject(
        this.chain.faucet!.resources || { cpu: '0.1', memory: '128M' }
      ),
      volumeMounts: [
        { mountPath: '/configs', name: 'addresses' },
        { mountPath: '/faucet', name: 'faucet' },
      ],
    };
  }
}

/**
 * Main Cosmos builder
 * Orchestrates ConfigMap, Service, and StatefulSet generation and file output
 */
export class CosmosBuilder implements IGenerator {
  private config: StarshipConfig;
  private scriptManager: ScriptManager;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.scriptManager = new ScriptManager();
  }

  generate(): Manifest[] {
    const manifests: Manifest[] = [];
    if (!this.config.chains) {
      return manifests;
    }

    // Filter out non-Cosmos chains (e.g., Ethereum)
    const cosmosChains = this.config.chains.filter(
      (chain) => chain.name !== 'ethereum' && typeof chain.id === 'string'
    );

    if (cosmosChains.length === 0) {
      return manifests;
    }

    // Keys ConfigMap
    const keysConfigMap = new KeysConfigMap(this.config);
    manifests.push(...keysConfigMap.generate());

    // Global Scripts ConfigMap
    const globalScripts = new GlobalScriptsConfigMap(this.config);
    const globalScriptsCm = globalScripts.configMap();
    if (globalScriptsCm) {
      manifests.push(globalScriptsCm);
    }

    cosmosChains.forEach((chain) => {
      // Use sophisticated service generator
      const serviceGenerator = new CosmosServiceGenerator(chain, this.config);

      // Genesis Service (always needed)
      manifests.push(...serviceGenerator.generate());

      // Use sophisticated StatefulSet generator
      const statefulSetGenerator = new CosmosStatefulSetGenerator(
        chain,
        this.config,
        this.scriptManager
      );

      // Genesis StatefulSet (always needed)
      manifests.push(statefulSetGenerator.genesisStatefulSet());

      // Validator StatefulSet (only if numValidators > 1)
      if ((chain.numValidators || 1) > 1) {
        manifests.push(statefulSetGenerator.validatorStatefulSet());
      }

      // Setup Scripts ConfigMap
      const setupScripts = new SetupScriptsConfigMap(this.config, chain);
      const setupScriptsCm = setupScripts.configMap();
      if (setupScriptsCm) {
        manifests.push(setupScriptsCm);
      }

      // Genesis Patch ConfigMap (if needed)
      if (chain.genesis) {
        const patch = new GenesisPatchConfigMap(this.config, chain);
        manifests.push(patch.configMap());
      }

      // ICS Consumer Proposal ConfigMap
      const icsProposal = new IcsConsumerProposalConfigMap(
        this.config,
        chain,
        cosmosChains
      );
      const icsCm = icsProposal.configMap();
      if (icsCm) {
        manifests.push(icsCm);
      }
    });

    return manifests;
  }
}

class KeysConfigMap implements IGenerator {
  constructor(
    private config: StarshipConfig,
    private projectRoot: string = process.cwd()
  ) {}

  generate(): Manifest[] {
    const keysFilePath = path.join(this.projectRoot, 'configs', 'keys.json');

    if (!fs.existsSync(keysFilePath)) {
      console.warn(
        `Warning: 'configs/keys.json' not found. Skipping Keys ConfigMap.`
      );
      return [];
    }

    try {
      const keysFileContent = fs.readFileSync(keysFilePath, 'utf-8');
      return [{
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'keys',
          labels: {
            ...TemplateHelpers.commonLabels(this.config),
            'app.kubernetes.io/component': 'configmap',
            'app.kubernetes.io/part-of': 'global',
          },
        },
        data: {
          'keys.json': keysFileContent,
          },
        },
      ];
    } catch (error) {
      console.warn(
        `Warning: Could not read 'configs/keys.json'. Error: ${(error as Error).message}. Skipping.`
      );
      return null;
    }
  }
}

class GlobalScriptsConfigMap {
  constructor(
    private config: StarshipConfig,
    private projectRoot: string = process.cwd()
  ) {}

  configMap(): ConfigMap | null {
    const scriptsDir = path.join(this.projectRoot, 'scripts', 'default');
    if (!fs.existsSync(scriptsDir)) {
      return null; // No global scripts directory found
    }

    const data: { [key: string]: string } = {};
    try {
      const scriptFiles = fs
        .readdirSync(scriptsDir)
        .filter((file) => file.endsWith('.sh'));

      if (scriptFiles.length === 0) {
        return null;
      }

      scriptFiles.forEach((fileName) => {
        const filePath = path.join(scriptsDir, fileName);
        data[fileName] = fs.readFileSync(filePath, 'utf-8');
      });
    } catch (error) {
      console.warn(
        `Warning: Could not read global scripts directory. Error: ${(error as Error).message}. Skipping.`
      );
      return null;
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'setup-scripts',
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/component': 'configmap',
          'app.kubernetes.io/part-of': 'global',
        },
      },
      data,
    };
  }
}

class SetupScriptsConfigMap {
  constructor(
    private config: StarshipConfig,
    private chain: Chain
  ) {}

  configMap(): ConfigMap | null {
    const scripts = this.chain.scripts;

    if (!scripts || Object.keys(scripts).length === 0) {
      return null;
    }

    const data: { [key: string]: string } = {};

    Object.entries(scripts).forEach(([key, script]) => {
      if (!script) return;

      const scriptName = script.name || `${key}.sh`;

      if (script.data) {
        data[scriptName] = script.data;
      } else if (script.file) {
        try {
          // Assuming file paths are relative to the current working directory
          data[scriptName] = fs.readFileSync(script.file, 'utf-8');
        } catch (error) {
          console.warn(
            `Warning: Could not read script file ${script.file}. Error: ${(error as Error).message}. Skipping.`
          );
        }
      }
    });

    if (Object.keys(data).length === 0) {
      return null;
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `setup-scripts-${TemplateHelpers.chainName(String(this.chain.id))}`,
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/component': 'chain',
          'app.kubernetes.io/name': this.chain.name, // Add the missing chain name label
          'app.kubernetes.io/part-of': String(this.chain.id),
          'app.kubernetes.io/role': 'setup-scripts',
        },
      },
      data,
    };
  }
}

class GenesisPatchConfigMap {
  constructor(
    private config: StarshipConfig,
    private chain: Chain
  ) {}

  configMap(): ConfigMap {
    // ConfigMap definition here...
    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `patch-${TemplateHelpers.chainName(String(this.chain.id))}`,
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/component': 'chain',
          'app.kubernetes.io/name': this.chain.name, // Add the missing chain name label
          'app.kubernetes.io/part-of': String(this.chain.id),
          'app.kubernetes.io/role': 'genesis-patch',
        },
      },
      data: {
        'patch.json': JSON.stringify(this.chain.genesis, null, 2),
      },
    };
  }
}

class IcsConsumerProposalConfigMap {
  constructor(
    private config: StarshipConfig,
    private chain: Chain,
    private allChains: Chain[]
  ) {}

  configMap(): ConfigMap | null {
    if (
      !this.chain.ics ||
      !this.chain.ics.enabled ||
      !this.chain.ics.provider
    ) {
      return null;
    }

    const providerChain = this.allChains.find(
      (c) => c.id === this.chain.ics.provider
    );
    if (!providerChain) {
      console.warn(
        `Warning: ICS Provider chain '${this.chain.ics.provider}' not found. Skipping ICS proposal for '${this.chain.id}'.`
      );
      return null;
    }

    const proposal = {
      title: `Add ${this.chain.name} consumer chain`,
      summary: `Add ${this.chain.name} consumer chain with id ${this.chain.id}`,
      chain_id: this.chain.id,
      initial_height: {
        revision_height: 1,
        revision_number: 1,
      },
      genesis_hash:
        'd86d756e10118e66e6805e9cc476949da2e750098fcc7634fd0cc77f57a0b2b0', // placeholder
      binary_hash:
        '376cdbd3a222a3d5c730c9637454cd4dd925e2f9e2e0d0f3702fc922928583f1', // placeholder
      spawn_time: '2023-02-28T20:40:00.000000Z', // placeholder
      unbonding_period: 294000000000,
      ccv_timeout_period: 259920000000,
      transfer_timeout_period: 18000000000,
      consumer_redistribution_fraction: '0.75',
      blocks_per_distribution_transmission: 10,
      historical_entries: 100,
      distribution_transmission_channel: '',
      top_N: 95,
      validators_power_cap: 0,
      validator_set_cap: 0,
      allowlist: [] as string[],
      denylist: [] as string[],
      deposit: `10000${providerChain.denom}`,
    };

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `consumer-proposal-${TemplateHelpers.chainName(String(this.chain.id))}`,
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/component': 'chain',
          'app.kubernetes.io/name': this.chain.name, // Add the missing chain name label
          'app.kubernetes.io/part-of': String(this.chain.id),
          'app.kubernetes.io/role': 'ics-proposal',
        },
      },
      data: {
        'proposal.json': JSON.stringify(proposal, null, 2),
      },
    };
  }
}
