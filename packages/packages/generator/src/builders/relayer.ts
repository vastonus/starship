import { Relayer, StarshipConfig } from '@starship-ci/types';

import { TemplateHelpers } from '../helpers';

/**
 * ConfigMap generator for different relayer types
 */
export class RelayerConfigMapGenerator {
  private config: StarshipConfig;
  private relayer: Relayer;

  constructor(config: StarshipConfig, relayer: Relayer) {
    this.config = config;
    this.relayer = relayer;
  }

  configMap(): any {
    const commonMetadata = {
      name: `${this.relayer.type}-${this.relayer.name}`,
      labels: {
        ...TemplateHelpers.commonLabels(this.config),
        'app.kubernetes.io/component': 'relayer',
        'app.kubernetes.io/part-of': 'starship',
        'app.kubernetes.io/role': this.relayer.type,
        'app.kubernetes.io/name': `${this.relayer.type}-${this.relayer.name}`
      }
    };

    switch (this.relayer.type) {
      case 'hermes':
        return this.generateHermesConfigMap(commonMetadata);
      case 'go-relayer':
        return this.generateGoRelayerConfigMap(commonMetadata);
      case 'ts-relayer':
        return this.generateTsRelayerConfigMap(commonMetadata);
      case 'neutron-query-relayer':
        return this.generateNeutronQueryRelayerConfigMap(commonMetadata);
      default:
        throw new Error(`Unsupported relayer type: ${this.relayer.type}`);
    }
  }

  private generateHermesConfigMap(metadata: any): any {
    const relayerConfig = this.relayer.config || {};
    const globalConfig = relayerConfig.global || {
      log_level: 'info'
    };
    const modeConfig = relayerConfig.mode || {
      clients: { enabled: true, refresh: true, misbehaviour: true },
      connections: { enabled: true },
      channels: { enabled: true },
      packets: { enabled: true, clear_interval: 100, clear_on_start: true, tx_confirmation: true }
    };
    const restConfig = relayerConfig.rest || {
      enabled: true,
      host: '0.0.0.0',
      port: 3000
    };
    const telemetryConfig = relayerConfig.telemetry || {
      enabled: true,
      host: '0.0.0.0',
      port: 3001
    };
    const eventSourceConfig = relayerConfig.event_source || {
      mode: 'push'
    };

    let configToml = `# The global section has parameters that apply globally to the relayer operation.
[global]
log_level = "${globalConfig.log_level}"

[mode]
[mode.clients]
enabled = ${modeConfig.clients.enabled}
refresh = ${modeConfig.clients.refresh}
misbehaviour = ${modeConfig.clients.misbehaviour}

[mode.connections]
enabled = ${modeConfig.connections.enabled}

[mode.channels]
enabled = ${modeConfig.channels.enabled}

[mode.packets]
enabled = ${modeConfig.packets.enabled}
clear_interval = ${modeConfig.packets.clear_interval}
clear_on_start = ${modeConfig.packets.clear_on_start}
tx_confirmation = ${modeConfig.packets.tx_confirmation}

[rest]
enabled = ${restConfig.enabled}
host = "${restConfig.host}"
port = ${restConfig.port}

[telemetry]
enabled = ${telemetryConfig.enabled}
host = "${telemetryConfig.host}"
port = ${telemetryConfig.port}

`;

    // Add chain configurations
    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not found in configuration`);
      }

      const chainConfig = relayerConfig.chains?.find((c: any) => c.id === chainId) || {};
      const chainName = TemplateHelpers.chainName(String(chain.id));
      const addressType = this.getAddressType(chain.name);
      const gasPrice = this.getGasPrice(chain.name, chain.denom);

      configToml += `
[[chains]]
id = "${chainId}"
type = "CosmosSdk"
key_name = "${chainId}"
${chain.ics?.enabled ? 'ccv_consumer_chain = true' : ''}
rpc_addr = "http://${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657"
grpc_addr = "http://${chainName}-genesis.$(NAMESPACE).svc.cluster.local:9090"
${eventSourceConfig.mode === 'pull' 
  ? `event_source = { mode = 'pull', interval = '${eventSourceConfig.interval || '500ms'}' }`
  : `event_source = { mode = 'push', url = "ws://${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657/websocket", batch_delay = '${eventSourceConfig.batch_delay || '500ms'}' }`
}
trusted_node = false
account_prefix = "${chainConfig.account_prefix || chain.prefix}"
default_gas = ${chainConfig.default_gas || 500000000}
max_gas = ${chainConfig.max_gas || 1000000000}
rpc_timeout = "${chainConfig.rpc_timeout || '10s'}"
store_prefix = "${chainConfig.store_prefix || 'ibc'}"
gas_multiplier = ${chainConfig.gas_multiplier || 2}
max_msg_num = ${chainConfig.max_msg_num || 30}
max_tx_size = ${chainConfig.max_tx_size || 2097152}
clock_drift = "${chainConfig.clock_drift || '5s'}"
max_block_time = "${chainConfig.max_block_time || '30s'}"
trusting_period = "${chainConfig.trusting_period || '75s'}"
trust_threshold = { numerator = "${(chainConfig.trust_threshold || {}).numerator || '2'}", denominator = "${(chainConfig.trust_threshold || {}).denominator || '3'}" }
${addressType}
${gasPrice}
`;
    });

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata,
      data: {
        'config.toml': configToml,
        'config-cli.toml': configToml.replace(/key_name = "([^"]+)"/g, 'key_name = "$1-cli"')
      }
    };
  }

  private generateGoRelayerConfigMap(metadata: any): any {
    const pathJson: any = {
      src: { 'chain-id': this.relayer.chains[0] },
      dst: { 'chain-id': this.relayer.chains[1] },
      'src-channel-filter': { rule: null, 'channel-list': [] }
    };

    const data: Record<string, string> = {
      'path.json': JSON.stringify(pathJson, null, 2)
    };

    // Add chain configurations
    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not found in configuration`);
      }

      const chainName = TemplateHelpers.chainName(String(chain.id));
      const chainConfig = {
        type: 'cosmos',
        value: {
          key: 'default',
          'chain-id': chainId,
          'rpc-addr': `http://${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657`,
          'account-prefix': chain.prefix,
          'keyring-backend': 'test',
          'gas-adjustment': 1.5,
          'gas-prices': `0.025${chain.denom}`,
          'min-gas-amount': 1,
          debug: true,
          timeout: '20s',
          'output-format': 'json',
          'sign-mode': 'direct'
        }
      };

      data[`${chainId}.json`] = JSON.stringify(chainConfig, null, 2);
    });

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata,
      data
    };
  }

  private generateTsRelayerConfigMap(metadata: any): any {
    const templateApp = `src: <SRC>
dest: <DEST>
mnemonic: <MNEMONIC>`;

    let registry = 'version: 1\nchains:\n';

    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not found in configuration`);
      }

      const chainName = TemplateHelpers.chainName(String(chain.id));
      registry += `  ${chainId}:
    chain_id: ${chainId}
    rpc:
      - http://${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657
    prefix: ${chain.prefix}
    gas_price: 0.025${chain.denom}
    hd_path: ${chain.hdPath || "m/44'/118'/0'/0/0"}
    ics20_port: 'transfer'
    estimated_block_time: ${this.config.timeouts?.timeout_commit?.replace('ms', '') || '5000'}
    estimated_indexer_time: ${this.config.timeouts?.time_iota_ms?.toString().replace('ms', '') || '1000'}
`;
    });

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata,
      data: {
        'template-app.yaml': templateApp,
        'registry.yaml': registry
      }
    };
  }

  private generateNeutronQueryRelayerConfigMap(metadata: any): any {
    const relayerConfig = this.relayer.config || {};
    const neutronChain = this.relayer.chains.find(chainId => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      return chain?.name === 'neutron';
    });
    const targetChain = this.relayer.chains.find(chainId => chainId !== neutronChain);

    if (!neutronChain || !targetChain) {
      throw new Error('Neutron query relayer requires neutron chain and one target chain');
    }

    const neutronChainConfig = this.config.chains.find(c => String(c.id) === neutronChain);
    const targetChainConfig = this.config.chains.find(c => String(c.id) === targetChain);
    const neutronChainName = TemplateHelpers.chainName(String(neutronChainConfig?.id));
    const targetChainName = TemplateHelpers.chainName(String(targetChainConfig?.id));

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata,
      data: {
        'relayer-neutron-chain-rpc-addr': `http://${neutronChainName}-genesis.$(NAMESPACE).svc.cluster.local:26657`,
        'relayer-neutron-chain-rest-addr': `http://${neutronChainName}-genesis.$(NAMESPACE).svc.cluster.local:1317`,
        'relayer-neutron-chain-home-dir': neutronChainConfig?.home || '/root/.neutrond',
        'relayer-target-chain-rpc-addr': `http://${targetChainName}-genesis.$(NAMESPACE).svc.cluster.local:26657`,
        'relayer-registry-addresses': `http://registry.$(NAMESPACE).svc.cluster.local:8080`,
        'relayer-listen-addr': '0.0.0.0:9999'
      }
    };
  }

  private getAddressType(chainName: string): string {
    if (chainName === 'evmos') {
      return "address_type = { derivation = 'ethermint', proto_type = { pk_type = '/ethermint.crypto.v1.ethsecp256k1.PubKey' } }";
    } else if (chainName === 'injective') {
      return "address_type = { derivation = 'ethermint', proto_type = { pk_type = '/injective.crypto.v1beta1.ethsecp256k1.PubKey' } }";
    } else {
      return "address_type = { derivation = 'cosmos' }";
    }
  }

  private getGasPrice(chainName: string, denom?: string): string {
    if (chainName === 'evmos' || chainName === 'injective') {
      return `gas_price = { price = 2500000, denom = "${denom}" }`;
    } else {
      return `gas_price = { price = 1.25, denom = "${denom}" }`;
    }
  }
}

/**
 * Service generator for relayers
 */
export class RelayerServiceGenerator {
  private config: StarshipConfig;
  private relayer: Relayer;

  constructor(config: StarshipConfig, relayer: Relayer) {
    this.config = config;
    this.relayer = relayer;
  }

  service(): any {
    const metadata = {
      name: `${this.relayer.type}-${this.relayer.name}`,
      labels: {
        ...TemplateHelpers.commonLabels(this.config),
        'app.kubernetes.io/component': 'relayer',
        'app.kubernetes.io/part-of': 'starship',
        'app.kubernetes.io/role': this.relayer.type,
        'app.kubernetes.io/name': `${this.relayer.type}-${this.relayer.name}`
      }
    };

    const ports = this.getServicePorts();

    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata,
      spec: {
        clusterIP: 'None',
        ports,
        selector: {
          'app.kubernetes.io/name': `${this.relayer.type}-${this.relayer.name}`
        }
      }
    };
  }

  private getServicePorts(): any[] {
    const ports = [];

    switch (this.relayer.type) {
      case 'hermes':
        ports.push(
          {
            name: 'rest',
            port: 3000,
            protocol: 'TCP',
            targetPort: this.relayer.config?.rest?.port || 3000
          },
          {
            name: 'exposer',
            port: this.config.exposer?.ports?.rest || 8081,
            protocol: 'TCP',
            targetPort: this.config.exposer?.ports?.rest || 8081
          }
        );
        break;
      case 'neutron-query-relayer':
        ports.push({
          name: 'rest',
          port: 3000,
          protocol: 'TCP',
          targetPort: 9999
        });
        break;
      default:
        // ts-relayer and go-relayer don't expose services
        break;
    }

    return ports;
  }
}

/**
 * StatefulSet generator for relayers
 */
export class RelayerStatefulSetGenerator {
  private config: StarshipConfig;
  private relayer: Relayer;

  constructor(config: StarshipConfig, relayer: Relayer) {
    this.config = config;
    this.relayer = relayer;
  }

  statefulSet(): any {
    const fullname = `${this.relayer.type}-${this.relayer.name}`;
    
    return {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: fullname,
        labels: {
          ...TemplateHelpers.commonLabels(this.config),
          'app.kubernetes.io/component': 'relayer',
          'app.kubernetes.io/part-of': 'starship',
          'app.kubernetes.io/role': this.relayer.type,
          'app.kubernetes.io/name': fullname
        }
      },
      spec: {
        serviceName: fullname,
        replicas: this.relayer.replicas || 1,
        podManagementPolicy: 'Parallel',
        revisionHistoryLimit: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/instance': 'relayer',
            'app.kubernetes.io/type': this.relayer.type,
            'app.kubernetes.io/name': fullname
          }
        },
        template: {
          metadata: {
            annotations: {
              quality: 'release',
              role: 'api-gateway',
              sla: 'high',
              tier: 'gateway'
            },
            labels: {
              'app.kubernetes.io/instance': 'relayer',
              'app.kubernetes.io/type': this.relayer.type,
              'app.kubernetes.io/name': fullname,
              'app.kubernetes.io/rawname': this.relayer.name,
              'app.kubernetes.io/version': this.config.version || '1.8.0'
            }
          },
          spec: {
            initContainers: this.generateInitContainers(),
            containers: this.generateContainers(),
            volumes: this.generateVolumes()
          }
        }
      }
    };
  }

  private generateInitContainers(): any[] {
    const initContainers = [];

    // Add exposer init container for hermes
    if (this.relayer.type === 'hermes') {
      initContainers.push({
        name: 'init-exposer',
        image: this.config.exposer?.image || 'ghcr.io/cosmology-tech/starship/exposer:v0.2.0',
        imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
        command: ['bash', '-c'],
        args: [
          '# Install exposer binary from the image\ncp /bin/exposer /exposer/exposer\nchmod +x /exposer/exposer'
        ],
        resources: TemplateHelpers.getResourceObject(this.relayer.resources || { cpu: '0.1', memory: '100M' }),
        volumeMounts: [{ mountPath: '/exposer', name: 'exposer' }]
      });
    }

    // Add wait init containers for all chains
    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) return;

      const chainName = TemplateHelpers.chainName(String(chain.id));
      initContainers.push({
        name: `init-${chainName}`,
        image: 'ghcr.io/cosmology-tech/starship/wait-for-service:v0.1.0',
        imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
        command: ['bash', '-c'],
        args: [
          `echo "Waiting for ${chainName} service..."\nwait-for-service ${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26657`
        ],
        env: [
          {
            name: 'NAMESPACE',
            valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } }
          }
        ]
      });
    });

    // Add relayer-specific init container
    initContainers.push(this.generateRelayerInitContainer());

    return initContainers;
  }

  private generateRelayerInitContainer(): any {
    const image = this.relayer.image || this.getDefaultImage();
    const env = [
      { name: 'KEYS_CONFIG', value: '/keys/keys.json' },
      { name: 'NAMESPACE', valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } } }
    ];

    const volumeMounts = [
      { mountPath: '/root', name: 'relayer' },
      { mountPath: '/configs', name: 'relayer-config' },
      { mountPath: '/keys', name: 'keys' },
      { mountPath: '/scripts', name: 'scripts' }
    ];

    const command = this.generateInitCommand();

    return {
      name: 'init-relayer',
      image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: this.extendEnvForRelayerType(env),
      command: ['bash', '-c'],
      args: [command],
      resources: TemplateHelpers.getResourceObject(this.relayer.resources || { cpu: '0.2', memory: '200M' }),
      volumeMounts
    };
  }

  private generateContainers(): any[] {
    const containers = [];

    // Main relayer container
    containers.push(this.generateMainRelayerContainer());

    // Add exposer container for hermes
    if (this.relayer.type === 'hermes') {
      containers.push(this.generateExposerContainer());
    }

    return containers;
  }

  private generateMainRelayerContainer(): any {
    const image = this.relayer.image || this.getDefaultImage();
    const env = this.getMainContainerEnv();
    const command = this.getMainContainerCommand();
    const volumeMounts = this.getMainContainerVolumeMounts();

    return {
      name: 'relayer',
      image,
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env,
      command: ['bash', '-c'],
      args: [command],
      resources: TemplateHelpers.getResourceObject(this.relayer.resources || { cpu: '0.2', memory: '200M' }),
      securityContext: {
        allowPrivilegeEscalation: false,
        runAsUser: 0
      },
      volumeMounts
    };
  }

  private generateExposerContainer(): any {
    return {
      name: 'exposer',
      image: this.relayer.image || this.getDefaultImage(),
      imagePullPolicy: this.config.images?.imagePullPolicy || 'IfNotPresent',
      env: [
        { name: 'EXPOSER_HTTP_PORT', value: '8081' },
        { name: 'EXPOSER_GRPC_PORT', value: '9099' }
      ],
      command: ['bash', '-c'],
      args: ['/exposer/exposer'],
      resources: TemplateHelpers.getResourceObject(this.config.exposer?.resources || { cpu: '0.1', memory: '100M' }),
      securityContext: {
        allowPrivilegeEscalation: false,
        runAsUser: 0
      },
      volumeMounts: [
        { mountPath: '/root', name: 'relayer' },
        { mountPath: '/configs', name: 'relayer-config' },
        { mountPath: '/exposer', name: 'exposer' }
      ]
    };
  }

  private generateVolumes(): any[] {
    const volumes = [
      { name: 'relayer', emptyDir: {} },
      { name: 'relayer-config', configMap: { name: `${this.relayer.type}-${this.relayer.name}` } },
      { name: 'keys', configMap: { name: 'keys' } },
      { name: 'scripts', configMap: { name: 'setup-scripts' } }
    ];

    if (this.relayer.type === 'hermes') {
      volumes.push({ name: 'exposer', emptyDir: {} });
    }

    return volumes;
  }

  private getDefaultImage(): string {
    switch (this.relayer.type) {
      case 'hermes':
        return 'ghcr.io/cosmology-tech/starship/hermes:1.10.0';
      case 'go-relayer':
        return 'ghcr.io/cosmology-tech/starship/go-relayer:v2.4.1';
      case 'ts-relayer':
        return 'ghcr.io/cosmology-tech/starship/ts-relayer:0.9.0';
      case 'neutron-query-relayer':
        return 'ghcr.io/cosmology-tech/starship/neutron-query-relayer:v0.2.0';
      default:
        throw new Error(`Unknown relayer type: ${this.relayer.type}`);
    }
  }

  private extendEnvForRelayerType(baseEnv: any[]): any[] {
    const env = [...baseEnv];

    switch (this.relayer.type) {
      case 'hermes':
        env.push(
          { name: 'RELAYER_DIR', value: '/root/.hermes' },
          { name: 'RELAYER_INDEX', value: '$HOSTNAME##*-' }
        );
        break;
      case 'ts-relayer':
        env.push(
          { name: 'SRC_CHAIN', value: this.relayer.chains[0] },
          { name: 'DEST_CHAIN', value: this.relayer.chains[1] },
          { name: 'RELAYER_DIR', value: '/root/.ibc-setup' }
        );
        break;
      case 'go-relayer':
        env.push({ name: 'RELAYER_DIR', value: '/root' });
        break;
      case 'neutron-query-relayer':
        env.push(
          { name: 'RELAYER_DIR', value: '/root/.neutrond' },
          { name: 'RELAYER_INDEX', value: '$HOSTNAME##*-' }
        );
        break;
    }

    return env;
  }

  private generateInitCommand(): string {
    switch (this.relayer.type) {
      case 'hermes':
        return this.generateHermesInitCommand();
      case 'go-relayer':
        return this.generateGoRelayerInitCommand();
      case 'ts-relayer':
        return this.generateTsRelayerInitCommand();
      case 'neutron-query-relayer':
        return this.generateNeutronQueryRelayerInitCommand();
      default:
        throw new Error(`Unknown relayer type: ${this.relayer.type}`);
    }
  }

  private generateHermesInitCommand(): string {
    let command = `set -ux

RLY_INDEX=\${HOSTNAME##*-}
echo "Relayer Index: $RLY_INDEX"

mkdir -p $RELAYER_DIR
cp /configs/config.toml $RELAYER_DIR/config.toml
cp /configs/config-cli.toml $RELAYER_DIR/config-cli.toml

MNEMONIC=$(jq -r ".relayers[$RLY_INDEX].mnemonic" $KEYS_CONFIG)
echo $MNEMONIC > $RELAYER_DIR/mnemonic.txt
MNEMONIC_CLI=$(jq -r ".relayers_cli[$RLY_INDEX].mnemonic" $KEYS_CONFIG)
echo $MNEMONIC_CLI > $RELAYER_DIR/mnemonic-cli.txt

`;

    // Add key creation and funding for each chain
    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) return;

      const chainName = TemplateHelpers.chainName(String(chain.id));
      command += `
echo "Creating key for ${chainId}..."
hermes keys add \\
  --chain ${chainId} \\
  --mnemonic-file $RELAYER_DIR/mnemonic.txt \\
  --key-name ${chainId} \\
  --hd-path "${chain.hdPath || "m/44'/118'/0'/0/0"}"

DENOM="${chain.denom}"
RLY_ADDR=$(hermes --json keys list --chain ${chainId} | tail -1 | jq -r '.result."${chainId}".account')

echo "Transfer tokens to address $RLY_ADDR"
bash -e /scripts/transfer-tokens.sh \\
  $RLY_ADDR \\
  $DENOM \\
  http://${chainName}-genesis.$NAMESPACE.svc.cluster.local:8000/credit \\
  "${chain.faucet?.enabled || false}" || true
`;
    });

    // Add channel creation if specified
    if (this.relayer.channels && this.relayer.channels.length > 0) {
      this.relayer.channels.forEach((channel) => {
        command += `
hermes create channel \\
  ${channel['new-connection'] ? '--new-client-connection --yes \\' : ''}
  ${channel['b-chain'] ? `--b-chain ${channel['b-chain']} \\` : ''}
  ${channel['a-connection'] ? `--a-connection ${channel['a-connection']} \\` : ''}
  ${channel['channel-version'] ? `--channel-version ${channel['channel-version']} \\` : ''}
  ${channel.order ? `--order ${channel.order} \\` : ''}
  --a-chain ${channel['a-chain']} \\
  --a-port ${channel['a-port']} \\
  --b-port ${channel['b-port']}
`;
      });
    }

    return command;
  }

  private generateGoRelayerInitCommand(): string {
    let command = `set -ux

RLY_INDEX=\${HOSTNAME##*-}
echo "Relayer Index: $RLY_INDEX"

mkdir -p $RELAYER_DIR/.relayer
cp /configs/path.json $RELAYER_DIR/.relayer/

`;

    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) return;

      const chainName = TemplateHelpers.chainName(String(chain.id));
      command += `
cp /configs/${chainId}.json $RELAYER_DIR/.relayer/chains/

echo "Adding key for ${chainId}..."
MNEMONIC=$(jq -r ".relayers[$RLY_INDEX].mnemonic" $KEYS_CONFIG)
echo $MNEMONIC | rly keys restore ${chainId} default

DENOM="${chain.denom}"
RLY_ADDR=$(rly keys show ${chainId} default)

echo "Transfer tokens to address $RLY_ADDR"
bash -e /scripts/transfer-tokens.sh \\
  $RLY_ADDR \\
  $DENOM \\
  http://${chainName}-genesis.$NAMESPACE.svc.cluster.local:8000/credit \\
  "${chain.faucet?.enabled || false}" || true
`;
    });

    command += `
if [ $RLY_INDEX -eq 0 ]; then
  echo "Creating path and initializing light clients"
  rly paths new ${this.relayer.chains[0]} ${this.relayer.chains[1]} path
  rly light init ${this.relayer.chains[0]} -f
  rly light init ${this.relayer.chains[1]} -f
fi
`;

    return command;
  }

  private generateTsRelayerInitCommand(): string {
    let command = `RLY_INDEX=\${HOSTNAME##*-}
echo "Relayer Index: $RLY_INDEX"

mkdir -p $RELAYER_DIR
cp /configs/registry.yaml $RELAYER_DIR/registry.yaml
cp /configs/template-app.yaml $RELAYER_DIR/app.yaml

MNEMONIC=$(jq -r ".relayers[$RLY_INDEX].mnemonic" $KEYS_CONFIG)
sed -i -e "s/<SRC>/$SRC_CHAIN/g" $RELAYER_DIR/app.yaml
sed -i -e "s/<DEST>/$DEST_CHAIN/g" $RELAYER_DIR/app.yaml
sed -i -e "s/<MNEMONIC>/$MNEMONIC/g" $RELAYER_DIR/app.yaml

`;

    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain) return;

      const chainName = TemplateHelpers.chainName(String(chain.id));
      command += `
DENOM="${chain.denom}"
RLY_ADDR=$(ibc-setup keys list | grep "${chainId}" | awk '{print $2}')
echo "Relayer address $RLY_ADDR"

echo "Transfer tokens to address $RLY_ADDR"
bash -e /scripts/transfer-tokens.sh \\
  $RLY_ADDR \\
  $DENOM \\
  http://${chainName}-genesis.$NAMESPACE.svc.cluster.local:8000/credit \\
  "${chain.faucet?.enabled || false}" || true
`;
    });

    command += `
if [ $RLY_INDEX -eq 0 ]; then
  echo "Setting up default ics20 channel"
  ibc-setup ics20 -v --log-level debug
fi
`;

    return command;
  }

  private generateNeutronQueryRelayerInitCommand(): string {
    let command = `set -ux

echo "Adding key.... relayer"
jq -r ".relayers[$RELAYER_INDEX].mnemonic" $KEYS_CONFIG | neutrond keys add relayer --recover --keyring-backend="test"

`;

    this.relayer.chains.forEach((chainId) => {
      const chain = this.config.chains.find(c => String(c.id) === chainId);
      if (!chain || chain.name !== 'neutron') return;

      const chainName = TemplateHelpers.chainName(String(chain.id));
      command += `
DENOM="${chain.denom}"
RLY_ADDR=$(neutrond keys show relayer -a --keyring-backend='test')
echo "Transfer tokens to address $RLY_ADDR"

bash -e /scripts/transfer-tokens.sh \\
  $RLY_ADDR \\
  $DENOM \\
  http://${chainName}-genesis.$NAMESPACE.svc.cluster.local:8000/credit \\
  "${chain.faucet?.enabled || false}" || true

echo "Wait for connection id to be created"
bash -e /scripts/ibc-connection.sh \\
  http://registry.$NAMESPACE.svc.cluster.local:8080 \\
  ${this.relayer.chains[0]} \\
  ${this.relayer.chains[1]}
`;
    });

    return command;
  }

  private getMainContainerEnv(): any[] {
    const env = [];

    switch (this.relayer.type) {
      case 'hermes':
        env.push({ name: 'RELAYER_DIR', value: '/root/.hermes' });
        break;
      case 'ts-relayer':
        env.push({ name: 'RELAYER_DIR', value: '/root/.ibc-setup' });
        break;
      case 'go-relayer':
        env.push({ name: 'RELAYER_DIR', value: '/root' });
        break;
      case 'neutron-query-relayer':
        env.push(
          { name: 'RELAYER_DIR', value: '/root/.hermes' },
          { name: 'RELAYER_NEUTRON_CHAIN_SIGN_KEY_NAME', value: 'relayer' },
          { name: 'NAMESPACE', valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } } }
        );

        // Add config from ConfigMap
        Object.keys(this.relayer.config || {}).forEach((key) => {
          env.push({
            name: key,
            value: String(this.relayer.config![key])
          });
        });

        // Add environment variables from ConfigMap references
        [
          'RELAYER_NEUTRON_CHAIN_RPC_ADDR',
          'RELAYER_NEUTRON_CHAIN_REST_ADDR',
          'RELAYER_NEUTRON_CHAIN_HOME_DIR',
          'RELAYER_TARGET_CHAIN_RPC_ADDR',
          'RELAYER_REGISTRY_ADDRESSES',
          'RELAYER_LISTEN_ADDR'
        ].forEach((envVar) => {
          env.push({
            name: envVar,
            valueFrom: {
              configMapKeyRef: {
                name: `${this.relayer.type}-${this.relayer.name}`,
                key: envVar.toLowerCase().replace(/_/g, '-')
              }
            }
          });
        });
        break;
    }

    return env;
  }

  private getMainContainerCommand(): string {
    switch (this.relayer.type) {
      case 'hermes':
        return `RLY_INDEX=\${HOSTNAME##*-}
echo "Relayer Index: $RLY_INDEX"
hermes start`;

      case 'go-relayer':
        return 'rly start';

      case 'ts-relayer':
        return `RLY_INDEX=\${HOSTNAME##*-}
echo "Relayer Index: $RLY_INDEX"

CONNECTION=$(cat $RELAYER_DIR/app.yaml | grep "srcConnection")
if [[ -z $CONNECTION ]]; then
  echo "Setting up new ics20 channel"
  ibc-setup ics20 -v --log-level debug
fi

echo "Starting the relayer..."
ibc-relayer start -v --poll 20`;

      case 'neutron-query-relayer':
        return `echo "Starting neutron query relayer..."
neutron-query-relayer start`;

      default:
        throw new Error(`Unknown relayer type: ${this.relayer.type}`);
    }
  }

  private getMainContainerVolumeMounts(): any[] {
    const volumeMounts = [
      { mountPath: '/root', name: 'relayer' },
      { mountPath: '/configs', name: 'relayer-config' }
    ];

    if (this.relayer.type !== 'neutron-query-relayer') {
      volumeMounts.push(
        { mountPath: '/keys', name: 'keys' },
        { mountPath: '/scripts', name: 'scripts' }
      );
    }

    return volumeMounts;
  }
}

/**
 * Main Relayer builder
 * Orchestrates ConfigMap, Service, and StatefulSet generation for relayers
 */
export class RelayerBuilder {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  /**
   * Build all Kubernetes manifests for relayers
   */
  buildManifests(): any[] {
    if (!this.config.relayers || this.config.relayers.length === 0) {
      return [];
    }

    const manifests: any[] = [];

    this.config.relayers.forEach((relayer) => {
      const configMapGenerator = new RelayerConfigMapGenerator(this.config, relayer);
      const serviceGenerator = new RelayerServiceGenerator(this.config, relayer);
      const statefulSetGenerator = new RelayerStatefulSetGenerator(this.config, relayer);

      manifests.push(configMapGenerator.configMap());

      // Only generate service for relayer types that expose services
      if (relayer.type === 'hermes' || relayer.type === 'neutron-query-relayer') {
        manifests.push(serviceGenerator.service());
      }

      manifests.push(statefulSetGenerator.statefulSet());
    });

    return manifests;
  }
} 