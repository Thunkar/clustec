import { eq, desc } from "drizzle-orm";
import { type Db, clusterRuns } from "@clustec/common";

export const NUMERIC_DIM = 15;
export const FEATURE_DIM = 16;

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
  "hasTeardown",
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
}

/**
 * Load pre-computed cluster centroids and Gower ranges from the cluster run.
 */
export async function loadClusterCentroids(
  db: Db,
  networkId: string,
  runId?: number,
): Promise<{ centroids: ClusterCentroidData[]; ranges: number[]; runId: number } | null> {
  const [run] = runId != null
    ? await db
        .select({ id: clusterRuns.id, centroids: clusterRuns.centroids })
        .from(clusterRuns)
        .where(eq(clusterRuns.id, runId))
        .limit(1)
    : await db
        .select({ id: clusterRuns.id, centroids: clusterRuns.centroids })
        .from(clusterRuns)
        .where(eq(clusterRuns.networkId, networkId))
        .orderBy(desc(clusterRuns.computedAt))
        .limit(1);

  if (!run) return null;

  const stored = run.centroids as { centroids: ClusterCentroidData[]; ranges: number[] } | null;
  if (!stored?.centroids || !stored?.ranges) return null;

  return { centroids: stored.centroids, ranges: stored.ranges, runId: run.id };
}
