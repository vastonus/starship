import axios from 'axios';

import { StarshipConfig } from '../src/config';
import { createClient, expectClient } from '../test-utils/client';
import { config } from '../test-utils/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StarshipClient verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify all services successfully', async () => {
    const { client, ctx } = createClient();
    client.dependencies.forEach((dep) => (dep.installed = true));
    client.setConfig(config.config);

    // Mock successful responses for all services
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('/chains')) {
        return Promise.resolve({ status: 200, data: { chains: ['chain1'] } });
      }
      if (url.includes('/status')) {
        return Promise.resolve({ status: 200, data: { status: 'ok' } });
      }
      if (url.includes('/version')) {
        return Promise.resolve({ status: 200, data: { status: 'success' } });
      }
      if (url.includes('/config')) {
        return Promise.resolve({ status: 200, data: { chains: ['chain1'] } });
      }
      // For explorer
      return Promise.resolve({
        status: 200,
        data: '<html><body>Ping Dashboard</body></html>'
      });
    });

    await client.verify();
    expectClient(ctx, -1);
  });

  it('should handle registry verification failure', async () => {
    const { client, ctx } = createClient();
    client.dependencies.forEach((dep) => (dep.installed = true));
    client.setConfig(config.config);

    // Mock registry failure
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('/chains')) {
        return Promise.reject(new Error('Registry not available'));
      }
      // Other services succeed
      return Promise.resolve({ status: 200, data: { status: 'ok' } });
    });

    await client.verify();
    expectClient(ctx, 1);
  });

  it('should handle explorer verification failure', async () => {
    const { client, ctx } = createClient();
    client.dependencies.forEach((dep) => (dep.installed = true));
    client.setConfig(config.config);

    // Mock explorer failure
    mockedAxios.get.mockImplementation((url) => {
      if (
        !url.includes('/chains') &&
        !url.includes('/status') &&
        !url.includes('/version') &&
        !url.includes('/config')
      ) {
        return Promise.reject(new Error('Explorer not available'));
      }
      // Other services succeed
      return Promise.resolve({ status: 200, data: { status: 'ok' } });
    });

    await client.verify();
    expectClient(ctx, 1);
  });

  it('should handle relayer verification failure', async () => {
    const { client, ctx } = createClient();
    client.dependencies.forEach((dep) => (dep.installed = true));
    client.setConfig(config.config);

    // Mock relayer failure
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('/version')) {
        return Promise.reject(new Error('Relayer not available'));
      }
      // Other services succeed
      return Promise.resolve({ status: 200, data: { status: 'ok' } });
    });

    await client.verify();
    expectClient(ctx, 1);
  });

  it('should skip disabled services', async () => {
    const { client, ctx } = createClient();
    client.dependencies.forEach((dep) => (dep.installed = true));

    // Create config with disabled services
    const disabledConfig: StarshipConfig = {
      ...config.config,
      explorer: {
        ...config.config.explorer,
        enabled: false
      },
      registry: {
        ...config.config.registry,
        enabled: false
      }
    };
    client.setConfig(disabledConfig);

    // Mock successful responses for enabled services
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('/status')) {
        return Promise.resolve({ status: 200, data: { status: 'ok' } });
      }
      if (url.includes('/version')) {
        return Promise.resolve({ status: 200, data: { status: 'success' } });
      }
      return Promise.resolve({ status: 200, data: { status: 'ok' } });
    });

    await client.verify();
    expectClient(ctx, -1);
  });
});
