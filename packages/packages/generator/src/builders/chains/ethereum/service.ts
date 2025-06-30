import { Chain, StarshipConfig } from '@starship-ci/types';
import { Service } from 'kubernetesjs';

import * as helpers from '../../../helpers';
import { IGenerator } from '../../../types';

/**
 * Generates the Service for Ethereum chain
 * Based on the Helm template: chains/eth/service.yaml
 */
export class EthereumServiceGenerator implements IGenerator {
  private config: StarshipConfig;
  private chain: Chain;

  constructor(chain: Chain, config: StarshipConfig) {
    this.config = config;
    this.chain = chain;
  }

  generate(): Service[] {
    const name = `${this.chain.name}-${this.chain.id}`;

    // Port mappings from Helm template
    const portMap = {
      http: 8545,
      ws: 8546,
      rpc: 8551
    };

    return [
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: name,
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'chain',
            'app.kubernetes.io/name': name,
            'app.kubernetes.io/part-of': helpers.getChainId(this.chain),
            'app.kubernetes.io/role': 'service',
            'starship.io/chain-name': this.chain.name,
            'starship.io/chain-id': helpers.getChainId(this.chain)
          }
        },
        spec: {
          clusterIP: 'None',
          ports: Object.entries(portMap).map(([portName, port]) => ({
            name: portName,
            port,
            protocol: 'TCP' as const,
            targetPort: String(port)
          })),
          selector: {
            'app.kubernetes.io/name': name
          }
        }
      }
    ];
  }
}
