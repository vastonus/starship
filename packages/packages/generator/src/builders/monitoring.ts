import { StarshipConfig } from '@starship-ci/types';

import * as helpers from '../helpers';
import { IGenerator, Manifest } from '../types';

/**
 * Prometheus generators for monitoring
 * Based on the Helm template: monitoring/prometheus.yaml
 */
export class PrometheusConfigMapGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'prometheus-config',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        data: {
          'prometheus.yml': this.generatePrometheusConfig()
        }
      }
    ];
  }

  private generatePrometheusConfig(): string {
    let config = `# my global config
global:
  scrape_interval:     15s # Set the scrape interval to every 15 seconds. Default is every 1 minute.
  evaluation_interval: 15s # Evaluate rules every 15 seconds. The default is every 1 minute.
  # scrape_timeout is set to the global default (10s).
scrape_configs:
  # The job name is added as a label \`job=<job_name>\` to any timeseries scraped from this config.
  - job_name: 'kubernetes-apiservers'

    kubernetes_sd_configs:
      - role: endpoints
    scheme: https

    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token

    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
        action: keep
        regex: default;kubernetes;https

  - job_name: 'kubernetes-nodes'

    scheme: https

    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token

    kubernetes_sd_configs:
      - role: node

    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/\${1}/proxy/metrics

  - job_name: 'kubernetes-pods'

    kubernetes_sd_configs:
      - role: pod

    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\\d+)?;(\\d+)
        replacement: $1:$2
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: kubernetes_pod_name

  - job_name: 'kube-state-metrics'
    static_configs:
      - targets: ['kube-state-metrics.kube-system.svc.cluster.local:8080']

  - job_name: kubernetes-nodes-cadvisor
    scrape_interval: 10s
    scrape_timeout: 10s
    scheme: https  # remove if you want to scrape metrics on insecure port
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      # Only for Kubernetes ^1.7.3.
      # See: https://github.com/prometheus/prometheus/issues/2916
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/\${1}/proxy/metrics/cadvisor
    metric_relabel_configs:
      - action: replace
        source_labels: [id]
        regex: '^/machine\\.slice/machine-rkt\\\\x2d([^\\\\]+)\\\\.+/([^/]+)\\.service$'
        target_label: rkt_container_name
        replacement: '\${2}-\${1}'
      - action: replace
        source_labels: [id]
        regex: '^/system\\.slice/(.+)\\.service$'
        target_label: systemd_service_name
        replacement: '\${1}'

  - job_name: 'kubernetes-service-endpoints'

    kubernetes_sd_configs:
      - role: endpoints

    relabel_configs:
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scheme]
        action: replace
        target_label: __scheme__
        regex: (https?)
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: ([^:]+)(?::\\d+)?;(\\d+)
        replacement: $1:$2
      - action: labelmap
        regex: __meta_kubernetes_service_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_service_name]
        action: replace
        target_label: kubernetes_name
  
  - job_name: 'prometheus'
    # metrics_path defaults to '/metrics'
    # scheme defaults to 'http'.
    static_configs:
      - targets: ['localhost:9090']
  
`;

    // Add chain-specific monitoring jobs
    this.config.chains?.forEach((chain) => {
      if (chain.metrics) {
        const chainName = helpers.getChainName(String(chain.id));

        // Genesis job
        config += `  - job_name: '${chain.name}-genesis'
    static_configs:
      - targets: ['${chainName}-genesis.$(NAMESPACE).svc.cluster.local:26660']
        labels:
          instance: genesis
          type: genesis
          network: "${chain.name}"
`;

        // Validator jobs if numValidators > 1
        if (chain.numValidators && chain.numValidators > 1) {
          for (let i = 0; i < chain.numValidators - 1; i++) {
            config += `  - job_name: '${chain.name}-validator-${i}'
    static_configs:
      - targets: ['${chainName}-validator-${i}.${chainName}-validator.$(NAMESPACE).svc.cluster.local:26660']
        labels:
          instance: "validator-${i}"
          type: validator
          network: "${chain.name}"
`;
          }
        }
      }
    });

    return config;
  }
}

export class PrometheusRbacGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: {
          name: 'prometheus',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        rules: [
          {
            apiGroups: [''],
            resources: [
              'nodes',
              'nodes/proxy',
              'services',
              'endpoints',
              'pods'
            ],
            verbs: ['get', 'list', 'watch']
          },
          {
            apiGroups: ['extensions'],
            resources: ['ingresses'],
            verbs: ['get', 'list', 'watch']
          },
          {
            nonResourceURLs: ['/metrics'],
            verbs: ['get']
          }
        ]
      },
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: {
          name: 'prometheus',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'ClusterRole',
          name: 'prometheus'
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: 'default',
            namespace: '$(NAMESPACE)'
          }
        ]
      }
    ];
  }
}

export class PrometheusServiceGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'prometheus',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          },
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/port': '9090'
          }
        },
        spec: {
          clusterIP: 'None',
          ports: [
            {
              name: 'http',
              port: 9090,
              protocol: 'TCP',
              targetPort: 9090
            }
          ],
          selector: {
            'app.kubernetes.io/name': 'prometheus'
          }
        }
      }
    ];
  }
}

export class PrometheusDeploymentGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'prometheus',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship',
            'app.kubernetes.io/name': 'prometheus'
          }
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              'app.kubernetes.io/name': 'prometheus'
            }
          },
          template: {
            metadata: {
              labels: {
                'app.kubernetes.io/instance': 'monitoring',
                'app.kubernetes.io/name': 'prometheus'
              },
              annotations: {
                'prometheus.io/scrape': 'true',
                'prometheus.io/port': '9090'
              }
            },
            spec: {
              containers: [
                {
                  name: 'prometheus',
                  image: 'prom/prometheus',
                  args: [
                    '--storage.tsdb.retention=6h',
                    '--storage.tsdb.path=/prometheus',
                    '--config.file=/etc/prometheus/prometheus.yml'
                  ],
                  ports: [
                    {
                      name: 'web',
                      containerPort: 9090
                    }
                  ],
                  resources: helpers.getResourceObject(
                    this.config.monitoring.resources || {
                      cpu: '0.2',
                      memory: '400M'
                    }
                  ),
                  volumeMounts: [
                    {
                      name: 'prometheus-config-volume',
                      mountPath: '/etc/prometheus'
                    },
                    {
                      name: 'prometheus-storage-volume',
                      mountPath: '/prometheus'
                    }
                  ]
                }
              ],
              restartPolicy: 'Always',
              volumes: [
                {
                  name: 'prometheus-config-volume',
                  configMap: {
                    defaultMode: 420,
                    name: 'prometheus-config'
                  }
                },
                {
                  name: 'prometheus-storage-volume',
                  emptyDir: {}
                }
              ]
            }
          }
        }
      }
    ];
  }
}

/**
 * Grafana generators for monitoring
 * Based on the Helm template: monitoring/grafana.yaml
 */
export class GrafanaConfigMapGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'grafana-datasources',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        data: {
          'prometheus.yaml': JSON.stringify(
            {
              apiVersion: 1,
              datasources: [
                {
                  access: 'proxy',
                  editable: true,
                  name: 'prometheus',
                  orgId: 1,
                  type: 'prometheus',
                  url: 'http://prometheus.aws-starship.svc:9090',
                  version: 1
                }
              ]
            },
            null,
            2
          )
        }
      },
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'grafana-dashboard-providers',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        data: {
          'default.yaml': JSON.stringify(
            {
              apiVersion: 1,
              providers: [
                {
                  name: 'chain-dashboard',
                  orgId: 1,
                  type: 'file',
                  allowUiUpdates: true,
                  options: {
                    path: '/var/lib/grafana/dashboards'
                  }
                }
              ]
            },
            null,
            2
          )
        }
      },
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'grafana-dashboards',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        data: {
          // Note: In Helm template, this would load dashboard files from configs/grafana-dashboards/*.json
          // For now, we'll include a basic placeholder
          'basic-dashboard.json': JSON.stringify(
            {
              dashboard: {
                title: 'Starship Basic Dashboard',
                panels: []
              }
            },
            null,
            2
          )
        }
      }
    ];
  }
}

export class GrafanaServiceGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'grafana',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          },
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/port': '8080'
          }
        },
        spec: {
          clusterIP: 'None',
          ports: [
            {
              name: 'http',
              port: 8080,
              targetPort: 8080
            }
          ],
          selector: {
            'app.kubernetes.io/name': 'grafana'
          }
        }
      }
    ];
  }
}

export class GrafanaDeploymentGenerator implements IGenerator {
  private config: StarshipConfig;

  constructor(config: StarshipConfig) {
    this.config = config;
  }

  generate(): Array<Manifest> {
    if (!this.config.monitoring?.enabled) {
      return [];
    }

    return [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'grafana',
          labels: {
            ...helpers.getCommonLabels(this.config),
            'app.kubernetes.io/component': 'monitoring',
            'app.kubernetes.io/part-of': 'starship'
          }
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              'app.kubernetes.io/name': 'grafana'
            }
          },
          template: {
            metadata: {
              name: 'grafana',
              labels: {
                'app.kubernetes.io/instance': 'monitoring',
                'app.kubernetes.io/name': 'grafana'
              }
            },
            spec: {
              containers: [
                {
                  name: 'grafana',
                  image: 'grafana/grafana:latest',
                  env: [
                    { name: 'GF_SERVER_HTTP_PORT', value: '8080' },
                    { name: 'GF_SERVER_HTTP_ADDR', value: '0.0.0.0' },
                    { name: 'GF_AUTH_DISABLE_LOGIN_FORM', value: 'true' },
                    { name: 'GF_AUTH_ANONYMOUS_ENABLED', value: 'true' },
                    { name: 'GF_AUTH_ANONYMOUS_ORG_NAME', value: 'Main Org.' },
                    { name: 'GF_AUTH_ANONYMOUS_ORG_ROLE', value: 'Editor' }
                  ],
                  ports: [
                    {
                      name: 'grafana',
                      containerPort: 3000
                    }
                  ],
                  resources: helpers.getResourceObject(
                    this.config.monitoring.resources || {
                      cpu: '0.2',
                      memory: '400M'
                    }
                  ),
                  volumeMounts: [
                    {
                      mountPath: '/var/lib/grafana',
                      name: 'grafana-storage'
                    },
                    {
                      mountPath: '/etc/grafana/provisioning/datasources',
                      name: 'grafana-datasources',
                      readOnly: false
                    },
                    {
                      mountPath: '/etc/grafana/provisioning/dashboards',
                      name: 'grafana-dashboard-providers',
                      readOnly: false
                    },
                    {
                      mountPath: '/var/lib/grafana/dashboards',
                      name: 'grafana-dashboards',
                      readOnly: false
                    }
                  ]
                }
              ],
              volumes: [
                {
                  name: 'grafana-datasources',
                  configMap: {
                    defaultMode: 420,
                    name: 'grafana-datasources'
                  }
                },
                {
                  name: 'grafana-dashboard-providers',
                  configMap: {
                    defaultMode: 420,
                    name: 'grafana-dashboard-providers'
                  }
                },
                {
                  name: 'grafana-dashboards',
                  configMap: {
                    name: 'grafana-dashboards'
                  }
                },
                {
                  name: 'grafana-storage',
                  emptyDir: {}
                }
              ]
            }
          }
        }
      }
    ];
  }
}

/**
 * Main Monitoring builder
 * Orchestrates Prometheus and Grafana generation
 */
export class MonitoringBuilder implements IGenerator {
  private config: StarshipConfig;
  private generators: Array<IGenerator>;

  constructor(config: StarshipConfig) {
    this.config = config;
    this.generators = [];

    if (this.config.monitoring?.enabled) {
      this.generators = [
        // Prometheus
        new PrometheusRbacGenerator(config),
        new PrometheusConfigMapGenerator(config),
        new PrometheusServiceGenerator(config),
        new PrometheusDeploymentGenerator(config),

        // Grafana
        new GrafanaConfigMapGenerator(config),
        new GrafanaServiceGenerator(config),
        new GrafanaDeploymentGenerator(config)
      ];
    }
  }

  generate(): Array<Manifest> {
    return this.generators.flatMap((generator) => generator.generate());
  }
}
