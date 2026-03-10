import { createPublicClient, http, type PublicClient, type HttpTransport, type Chain } from "viem";
import { sepolia, mainnet } from "viem/chains";
import { RollupAbi } from "@aztec/l1-artifacts/RollupAbi";

const CHAIN_MAP: Record<number, { chain: Chain; defaultRpc: string }> = {
  1: { chain: mainnet, defaultRpc: "https://eth.llamarpc.com" },
  11155111: { chain: sepolia, defaultRpc: "https://ethereum-sepolia-rpc.publicnode.com" },
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedValue<T> {
  value: T;
  fetchedAt: number;
}

/**
 * Fetches fee-related data from the Aztec Rollup L1 contract
 * and converts transaction fees to USD estimates.
 */
export class FeePricingService {
  private client: PublicClient<HttpTransport, Chain> | null = null;
  private rollupAddress: `0x${string}` | null = null;

  // Caches
  private ethPerFeeAssetCache: CachedValue<bigint> | null = null;
  private ethUsdCache: CachedValue<number> | null = null;

  constructor(
    private readonly l1RpcUrl: string | undefined,
    private readonly l1ChainId: number | undefined,
  ) {}

  /**
   * Initialize with the rollup address (fetched from the Aztec node).
   */
  init(rollupAddress: string) {
    if (!this.l1ChainId) return;

    const entry = CHAIN_MAP[this.l1ChainId];
    if (!entry) return;

    const rpcUrl = this.l1RpcUrl ?? entry.defaultRpc;
    this.rollupAddress = rollupAddress as `0x${string}`;
    this.client = createPublicClient({
      chain: entry.chain,
      transport: http(rpcUrl),
    });
  }

  get enabled(): boolean {
    return this.client !== null && this.rollupAddress !== null;
  }

  /**
   * Get ETH per fee asset, scaled by 1e12.
   * Cached for 5 minutes.
   */
  private async getEthPerFeeAssetE12(): Promise<bigint | null> {
    if (!this.client || !this.rollupAddress) return null;

    if (this.ethPerFeeAssetCache && Date.now() - this.ethPerFeeAssetCache.fetchedAt < CACHE_TTL_MS) {
      return this.ethPerFeeAssetCache.value;
    }

    try {
      const value = await this.client.readContract({
        address: this.rollupAddress,
        abi: RollupAbi,
        functionName: "getEthPerFeeAsset",
      });
      this.ethPerFeeAssetCache = { value, fetchedAt: Date.now() };
      return value;
    } catch {
      return this.ethPerFeeAssetCache?.value ?? null;
    }
  }

  /**
   * Get current ETH/USD price from CoinGecko.
   * Cached for 5 minutes.
   */
  private async getEthUsdPrice(): Promise<number | null> {
    if (this.ethUsdCache && Date.now() - this.ethUsdCache.fetchedAt < CACHE_TTL_MS) {
      return this.ethUsdCache.value;
    }

    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      );
      if (!res.ok) return this.ethUsdCache?.value ?? null;
      const data = (await res.json()) as { ethereum?: { usd?: number } };
      const price = data.ethereum?.usd;
      if (price == null) return this.ethUsdCache?.value ?? null;
      this.ethUsdCache = { value: price, fetchedAt: Date.now() };
      return price;
    } catch {
      return this.ethUsdCache?.value ?? null;
    }
  }

  /**
   * Estimate the USD cost of a transaction given its actual fee (in FPA).
   *
   * Math:
   *   costEthWei = actualFee * ethPerFeeAssetE12 / 1e12
   *   costEth    = costEthWei / 1e18
   *   costUsd    = costEth * ethUsdPrice
   */
  async estimateTxCostUsd(actualFee: string): Promise<{
    costUsd: number;
    costEth: number;
    costFpa: number;
    ethUsdPrice: number;
    ethPerFeeAssetE12: string;
  } | null> {
    if (!this.enabled) return null;

    const feeBigInt = BigInt(actualFee);
    if (feeBigInt === 0n) return null;

    const [ethPerFeeAssetE12, ethUsdPrice] = await Promise.all([
      this.getEthPerFeeAssetE12(),
      this.getEthUsdPrice(),
    ]);

    if (ethPerFeeAssetE12 == null || ethUsdPrice == null) return null;

    // actualFee (FPA raw) * ethPerFeeAssetE12 / 1e12 = cost in ETH wei
    const costEthWei = (feeBigInt * ethPerFeeAssetE12) / BigInt(1e12);
    const costEth = Number(costEthWei) / 1e18;
    const costFpa = Number(feeBigInt) / 1e18;
    const costUsd = costEth * ethUsdPrice;

    return {
      costUsd,
      costEth,
      costFpa,
      ethUsdPrice,
      ethPerFeeAssetE12: ethPerFeeAssetE12.toString(),
    };
  }
}
