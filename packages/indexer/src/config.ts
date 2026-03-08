import { readFileSync } from "node:fs";

export interface NetworkConfig {
  id: string;
  name: string;
  nodeUrl: string;
  chainId: number;
  pollIntervalMs: number;
  batchSize: number;
  enabled: boolean;
}

export function loadConfig(configPath: string): NetworkConfig {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as NetworkConfig;

  if (!config.id || !config.nodeUrl) {
    throw new Error(
      `Invalid config at ${configPath}: 'id' and 'nodeUrl' are required`
    );
  }

  const defaults: NetworkConfig = {
    id: config.id,
    name: config.name ?? config.id,
    nodeUrl: config.nodeUrl,
    chainId: config.chainId ?? 0,
    pollIntervalMs: 2000,
    batchSize: 200,
    enabled: true,
  };

  return { ...defaults, ...config };
}
