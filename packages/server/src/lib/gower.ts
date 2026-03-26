import { eq, and, gte, desc } from "drizzle-orm";
import { type Db, clusterMemberships, clusterRuns, featureVectors } from "@clustec/common";

export const NUMERIC_DIM = 14;
export const FEATURE_DIM = 15;

export const DIM_NAMES = [
  "numNoteHashes",
  "numNullifiers",
  "numL2ToL1Msgs",
  "numPrivateLogs",
  "numContractClassLogs",
  "numPublicLogs",
  "gasLimitDa",
  "gasLimitL2",
  "maxFeePerDaGas",
  "maxFeePerL2Gas",
  "numSetupCalls",
  "numAppCalls",
  "totalPublicCalldataSize",
  "expirationDelta",
  "feePayer",
] as const;

export function gowerDistance(a: (number | string)[], b: (number | string)[], ranges: number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < NUMERIC_DIM; i++) {
    const ai = Number(a[i]);
    const bi = Number(b[i]);
    if (ranges[i] === 0) {
      sum += ai === bi ? 0 : 1;
    } else {
      sum += Math.abs(ai - bi) / ranges[i];
    }
    count++;
  }
  // Categorical dim (feePayer)
  sum += a[NUMERIC_DIM] === b[NUMERIC_DIM] ? 0 : 1;
  count++;
  return sum / count;
}

export interface ClusterCentroidData {
  clusterId: number;
  centroid: (number | string)[];
  count: number;
  txIds: number[];
}

/**
 * Load all non-outlier memberships + feature vectors for the latest run,
 * compute per-cluster centroids and global Gower ranges.
 */
export async function loadClusterCentroids(
  db: Db,
  networkId: string,
  runId?: number,
): Promise<{ centroids: ClusterCentroidData[]; ranges: number[]; runId: number } | null> {
  // Resolve run
  let resolvedRunId: number;
  if (runId != null) {
    resolvedRunId = runId;
  } else {
    const [latest] = await db
      .select({ id: clusterRuns.id })
      .from(clusterRuns)
      .where(eq(clusterRuns.networkId, networkId))
      .orderBy(desc(clusterRuns.computedAt))
      .limit(1);
    if (!latest) return null;
    resolvedRunId = latest.id;
  }

  const rows = await db
    .select({
      clusterId: clusterMemberships.clusterId,
      txId: clusterMemberships.txId,
      vector: featureVectors.vector,
    })
    .from(clusterMemberships)
    .innerJoin(featureVectors, eq(clusterMemberships.txId, featureVectors.txId))
    .where(
      and(
        eq(clusterMemberships.runId, resolvedRunId),
        gte(clusterMemberships.clusterId, 0),
      ),
    );

  if (rows.length === 0) return null;

  // Group by cluster
  const clusterMap = new Map<number, { vectors: (number | string)[][]; txIds: number[] }>();
  for (const row of rows) {
    const vec = row.vector as (number | string)[];
    let entry = clusterMap.get(row.clusterId);
    if (!entry) {
      entry = { vectors: [], txIds: [] };
      clusterMap.set(row.clusterId, entry);
    }
    entry.vectors.push(vec);
    entry.txIds.push(row.txId);
  }

  // Global ranges
  const allVectors = rows.map((r) => r.vector as (number | string)[]);
  const ranges: number[] = [];
  for (let d = 0; d < NUMERIC_DIM; d++) {
    const vals = allVectors.map((v) => Number(v[d]));
    ranges.push(Math.max(...vals) - Math.min(...vals));
  }

  // Centroids (median numeric, mode categorical)
  const centroids: ClusterCentroidData[] = [];
  for (const [clusterId, data] of clusterMap) {
    const centroid: (number | string)[] = [];
    for (let d = 0; d < NUMERIC_DIM; d++) {
      const sorted = data.vectors.map((v) => Number(v[d])).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      centroid.push(
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid],
      );
    }
    const freqs = new Map<string, number>();
    for (const v of data.vectors) {
      const val = String(v[NUMERIC_DIM]);
      freqs.set(val, (freqs.get(val) ?? 0) + 1);
    }
    let modeCat = "";
    let modeCount = 0;
    for (const [val, count] of freqs) {
      if (count > modeCount) { modeCat = val; modeCount = count; }
    }
    centroid.push(modeCat);

    centroids.push({ clusterId, centroid, count: data.vectors.length, txIds: data.txIds });
  }

  return { centroids, ranges, runId: resolvedRunId };
}
