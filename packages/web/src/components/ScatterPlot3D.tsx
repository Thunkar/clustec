import { useRef, useMemo, useEffect, useCallback, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import styled from "@emotion/styled";
import { theme } from "../lib/theme";
import type { UmapCluster, UmapOutlier } from "../lib/api";
import { useMyTxs } from "../stores/my-txs";

const Container = styled.div`
  width: 100%;
  border-radius: ${theme.radius.md};
  overflow: hidden;
  background: ${theme.colors.bg};

  @media (max-width: 768px) {
    height: 400px !important;
  }
`;

const TooltipContent = styled.div`
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  padding: 6px 10px;
  font-size: 11px;
  font-family: monospace;
  color: ${theme.colors.text};
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(4px);
`;

const ClusterLabel = styled.div<{ color: string }>`
  font-size: 10px;
  font-family: monospace;
  font-weight: 700;
  color: ${(p) => p.color};
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 1);
  pointer-events: none;
  user-select: none;
`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CLUSTER_COLORS = [
  "#8b7dff", "#ff7ea0", "#5aeaa0", "#ffd080", "#80d4ff",
  "#ffb080", "#d580ff", "#80ffd8", "#ff80e8", "#a0ff80",
  "#ff8080", "#80ffff", "#ffff80", "#80a0ff", "#ff80a0",
];

const OUTLIER_COLOR = "#ff3050";

interface ClusterBlob {
  clusterId: number;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  count: number;
  color: string;
}

function Axes({ size = 6 }: { size?: number }) {
  const gridOpacity = 0.06;
  const labelOffset = size + 0.5;

  const gridLines = useMemo(() => {
    const lines: [number, number, number][][] = [];
    for (let i = -size; i <= size; i += 2) {
      lines.push(
        [[-size, 0, i], [size, 0, i]],
        [[i, 0, -size], [i, 0, size]]
      );
    }
    return lines;
  }, [size]);

  return (
    <group>
      {gridLines.map((pts, i) => (
        <Line
          key={i}
          points={pts as [number, number, number][]}
          color="#ffffff"
          opacity={gridOpacity}
          transparent
          lineWidth={0.5}
        />
      ))}
      <Line points={[[-size, 0, 0], [size, 0, 0]]} color="#ff6070" opacity={0.3} transparent lineWidth={1.5} />
      <Line points={[[0, -size, 0], [0, size, 0]]} color="#60ff70" opacity={0.3} transparent lineWidth={1.5} />
      <Line points={[[0, 0, -size], [0, 0, size]]} color="#6070ff" opacity={0.3} transparent lineWidth={1.5} />
      <Html position={[labelOffset, 0, 0]} style={{ pointerEvents: "none" }}>
        <span style={{ color: "#ff6070", fontSize: 10, fontFamily: "monospace", opacity: 0.5 }}>X</span>
      </Html>
      <Html position={[0, labelOffset, 0]} style={{ pointerEvents: "none" }}>
        <span style={{ color: "#60ff70", fontSize: 10, fontFamily: "monospace", opacity: 0.5 }}>Y</span>
      </Html>
      <Html position={[0, 0, labelOffset]} style={{ pointerEvents: "none" }}>
        <span style={{ color: "#6070ff", fontSize: 10, fontFamily: "monospace", opacity: 0.5 }}>Z</span>
      </Html>
    </group>
  );
}

interface PointCloudProps {
  clusters: UmapCluster[];
  outliers: UmapOutlier[];
  trackedHashes: Set<string>;
  onClusterClick?: (clusterId: number) => void;
  onOutlierClick?: (outlier: UmapOutlier) => void;
}

function PointCloud({ clusters, outliers, trackedHashes, onClusterClick, onOutlierClick }: PointCloudProps) {
  const outlierMeshRef = useRef<THREE.InstancedMesh>(null);
  const blobMeshRef = useRef<THREE.InstancedMesh>(null);
  const { camera, pointer, size: canvasSize, gl } = useThree();
  const [hoveredOutlierIdx, setHoveredOutlierIdx] = useState<number | null>(null);
  const [hoveredBlobIdx, setHoveredBlobIdx] = useState<number | null>(null);

  const { blobs, outlierPositions } = useMemo(() => {
    // Collect all coordinates for normalization range
    const allX = [...clusters.map((c) => c.cx), ...outliers.map((o) => o.x)];
    const allY = [...clusters.map((c) => c.cy), ...outliers.map((o) => o.y)];
    const allZ = [...clusters.map((c) => c.cz), ...outliers.map((o) => o.z)];
    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const yMin = Math.min(...allY), yMax = Math.max(...allY);
    const zMin = Math.min(...allZ), zMax = Math.max(...allZ);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const zRange = zMax - zMin || 1;
    const SCALE = 16;

    const norm = (x: number, min: number, range: number) => ((x - min) / range - 0.5) * SCALE;

    // Build blobs from pre-computed centroids
    const maxCount = clusters.length > 0 ? Math.max(...clusters.map((c) => c.count)) : 1;
    const blobArr: ClusterBlob[] = clusters.map((c) => {
      const normalizedSize = Math.cbrt(c.count) / Math.cbrt(maxCount);
      return {
        clusterId: c.clusterId,
        cx: norm(c.cx, xMin, xRange),
        cy: norm(c.cy, yMin, yRange),
        cz: norm(c.cz, zMin, zRange),
        radius: 0.08 + normalizedSize * 0.42,
        count: c.count,
        color: CLUSTER_COLORS[c.clusterId % CLUSTER_COLORS.length],
      };
    });
    blobArr.sort((a, b) => a.clusterId - b.clusterId);

    // Build outlier positions
    const oPos = new Float32Array(outliers.length * 3);
    for (let i = 0; i < outliers.length; i++) {
      oPos[i * 3] = norm(outliers[i].x, xMin, xRange);
      oPos[i * 3 + 1] = norm(outliers[i].y, yMin, yRange);
      oPos[i * 3 + 2] = norm(outliers[i].z, zMin, zRange);
    }

    return { blobs: blobArr, outlierPositions: oPos };
  }, [clusters, outliers]);

  // Set up blob instanced mesh
  useEffect(() => {
    const mesh = blobMeshRef.current;
    if (!mesh || blobs.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let j = 0; j < blobs.length; j++) {
      const blob = blobs[j];
      dummy.position.set(blob.cx, blob.cy, blob.cz);
      dummy.scale.setScalar(blob.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(j, dummy.matrix);

      const [r, g, b] = hexToRgb(blob.color);
      mesh.setColorAt(j, new THREE.Color(r / 255, g / 255, b / 255));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blobs]);

  // Set up outlier mesh instances
  useEffect(() => {
    const mesh = outlierMeshRef.current;
    if (!mesh || outliers.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let j = 0; j < outliers.length; j++) {
      const isTracked = trackedHashes.has(outliers[j].txHash);
      dummy.position.set(outlierPositions[j * 3], outlierPositions[j * 3 + 1], outlierPositions[j * 3 + 2]);
      dummy.scale.setScalar(isTracked ? 0.12 : 0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(j, dummy.matrix);

      const color = isTracked ? theme.colors.warning : OUTLIER_COLOR;
      const [r, g, b] = hexToRgb(color);
      mesh.setColorAt(j, new THREE.Color(r / 255, g / 255, b / 255));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [outliers, outlierPositions, trackedHashes]);

  // Screen-space proximity for outlier detection
  const findNearestOutlier = useCallback((ndc: THREE.Vector2): number | null => {
    if (outliers.length === 0) return null;
    const SCREEN_THRESHOLD = 14;
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    const pos = new THREE.Vector3();

    for (let j = 0; j < outliers.length; j++) {
      pos.set(outlierPositions[j * 3], outlierPositions[j * 3 + 1], outlierPositions[j * 3 + 2]);
      pos.project(camera);
      if (pos.z >= 1) continue;
      const sx = (pos.x * 0.5 + 0.5) * canvasSize.width;
      const sy = (1 - (pos.y * 0.5 + 0.5)) * canvasSize.height;
      const mx = (ndc.x * 0.5 + 0.5) * canvasSize.width;
      const my = (1 - (ndc.y * 0.5 + 0.5)) * canvasSize.height;
      const dx = sx - mx;
      const dy = sy - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SCREEN_THRESHOLD && dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    return bestIdx;
  }, [outliers, outlierPositions, camera, canvasSize]);

  // Screen-space proximity for blob detection
  const findNearestBlob = useCallback((ndc: THREE.Vector2): number | null => {
    if (blobs.length === 0) return null;
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    const pos = new THREE.Vector3();

    for (let j = 0; j < blobs.length; j++) {
      const blob = blobs[j];
      pos.set(blob.cx, blob.cy, blob.cz);
      pos.project(camera);
      if (pos.z >= 1) continue;
      const sx = (pos.x * 0.5 + 0.5) * canvasSize.width;
      const sy = (1 - (pos.y * 0.5 + 0.5)) * canvasSize.height;
      const mx = (ndc.x * 0.5 + 0.5) * canvasSize.width;
      const my = (1 - (ndc.y * 0.5 + 0.5)) * canvasSize.height;
      const dx = sx - mx;
      const dy = sy - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Use distance from camera to estimate screen-space radius
      const worldPos = new THREE.Vector3(blob.cx, blob.cy, blob.cz);
      const camDist = worldPos.distanceTo(camera.position);
      const screenRadius = camDist > 0 ? (blob.radius / camDist) * canvasSize.width * 0.3 : 20;
      const threshold = Math.max(screenRadius + 8, 20);
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    return bestIdx;
  }, [blobs, camera, canvasSize]);

  useFrame(() => {
    // Outliers always take priority
    const nearOutlier = findNearestOutlier(pointer);
    if (nearOutlier !== null) {
      if (hoveredOutlierIdx !== nearOutlier) setHoveredOutlierIdx(nearOutlier);
      if (hoveredBlobIdx !== null) setHoveredBlobIdx(null);
      return;
    }

    // Then blobs
    const nearBlob = findNearestBlob(pointer);
    if (nearBlob !== null) {
      if (hoveredBlobIdx !== nearBlob) setHoveredBlobIdx(nearBlob);
      if (hoveredOutlierIdx !== null) setHoveredOutlierIdx(null);
      return;
    }

    if (hoveredOutlierIdx !== null) setHoveredOutlierIdx(null);
    if (hoveredBlobIdx !== null) setHoveredBlobIdx(null);
  });

  // Update cursor based on hover state
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.cursor = (hoveredOutlierIdx !== null || hoveredBlobIdx !== null) ? "pointer" : "grab";
  }, [hoveredOutlierIdx, hoveredBlobIdx, gl]);

  // Use a canvas-level click handler, but suppress clicks after drags
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const canvas = gl.domElement;
    const DRAG_THRESHOLD = 5;
    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
    };
    const handleClick = (e: MouseEvent) => {
      if (pointerDownPos.current) {
        const dx = e.clientX - pointerDownPos.current.x;
        const dy = e.clientY - pointerDownPos.current.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      }
      if (hoveredOutlierIdx !== null && onOutlierClick) {
        onOutlierClick(outliers[hoveredOutlierIdx]);
      } else if (hoveredBlobIdx !== null && onClusterClick) {
        onClusterClick(blobs[hoveredBlobIdx].clusterId);
      }
    };
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("click", handleClick);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("click", handleClick);
    };
  }, [hoveredOutlierIdx, hoveredBlobIdx, onOutlierClick, onClusterClick, outliers, blobs, gl]);

  const hoveredOutlier = hoveredOutlierIdx !== null ? outliers[hoveredOutlierIdx] : null;
  const hoveredBlob = hoveredBlobIdx !== null ? blobs[hoveredBlobIdx] : null;

  // Update blob colors to highlight hovered
  useEffect(() => {
    const mesh = blobMeshRef.current;
    if (!mesh || blobs.length === 0) return;
    for (let j = 0; j < blobs.length; j++) {
      const blob = blobs[j];
      const [r, g, b] = hexToRgb(blob.color);
      const brightness = hoveredBlobIdx === j ? 1.3 : 1.0;
      mesh.setColorAt(j, new THREE.Color(
        Math.min(r / 255 * brightness, 1),
        Math.min(g / 255 * brightness, 1),
        Math.min(b / 255 * brightness, 1),
      ));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [hoveredBlobIdx, blobs]);

  return (
    <group>
      {/* Cluster blobs — instanced transparent spheres */}
      {blobs.length > 0 && (
        <instancedMesh
          ref={blobMeshRef}
          args={[undefined, undefined, blobs.length]}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 20, 20]} />
          <meshPhongMaterial
            transparent
            opacity={0.35}
            shininess={30}
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </instancedMesh>
      )}

      {/* Outliers — octahedra with emissive glow */}
      {outliers.length > 0 && (
        <instancedMesh
          ref={outlierMeshRef}
          args={[undefined, undefined, outliers.length]}
          frustumCulled={false}
          renderOrder={1}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshPhongMaterial
            shininess={100}
            emissive={new THREE.Color(OUTLIER_COLOR)}
            emissiveIntensity={0.6}
            specular={new THREE.Color(0x666666)}
          />
        </instancedMesh>
      )}

      {/* Outlier tooltip */}
      {hoveredOutlier && hoveredOutlierIdx !== null && (
        <Html
          position={[
            outlierPositions[hoveredOutlierIdx * 3],
            outlierPositions[hoveredOutlierIdx * 3 + 1] + 0.3,
            outlierPositions[hoveredOutlierIdx * 3 + 2],
          ]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[100, 0]}
        >
          <TooltipContent>
            <div>{hoveredOutlier.txHash.slice(0, 18)}...</div>
            <div style={{ color: OUTLIER_COLOR }}>
              ⚠ OUTLIER
              {hoveredOutlier.outlierScore != null &&
                ` | risk ${(hoveredOutlier.outlierScore * 100).toFixed(0)}%`}
            </div>
          </TooltipContent>
        </Html>
      )}

      {/* Blob hover tooltip */}
      {hoveredBlob && (
        <Html
          position={[hoveredBlob.cx, hoveredBlob.cy + hoveredBlob.radius + 0.15, hoveredBlob.cz]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[100, 0]}
        >
          <TooltipContent>
            <div style={{ color: hoveredBlob.color, fontWeight: 600 }}>
              {hoveredBlob.count} txs
            </div>
            <div style={{ color: theme.colors.textMuted, fontSize: 10 }}>Click to inspect</div>
          </TooltipContent>
        </Html>
      )}

      {/* Cluster labels — count, positioned at centroid */}
      {blobs.map((blob) => (
        <Html
          key={blob.clusterId}
          position={[blob.cx, blob.cy, blob.cz]}
          center
          style={{ pointerEvents: "none" }}
          zIndexRange={[50, 0]}
        >
          <ClusterLabel color={blob.color}>
            {blob.count}
          </ClusterLabel>
        </Html>
      ))}
    </group>
  );
}

interface ScatterPlot3DProps {
  clusters: UmapCluster[];
  outliers: UmapOutlier[];
  height?: number | string;
  onClusterClick?: (clusterId: number) => void;
  onOutlierClick?: (outlier: UmapOutlier) => void;
}

export function ScatterPlot3D({ clusters, outliers, height = 500, onClusterClick, onOutlierClick }: ScatterPlot3DProps) {
  const { isTracked } = useMyTxs();
  const trackedHashes = useMemo(() => {
    const set = new Set<string>();
    for (const o of outliers) {
      if (isTracked(o.txHash)) set.add(o.txHash);
    }
    return set;
  }, [outliers, isTracked]);

  return (
    <Container style={{ height }}>
      <Canvas camera={{ position: [10, 7, 10], fov: 45 }} style={{ minHeight: 300 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 15, 10]} intensity={1.2} />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />
        <Axes />
        <PointCloud
          clusters={clusters}
          outliers={outliers}
          trackedHashes={trackedHashes}
          onClusterClick={onClusterClick}
          onOutlierClick={onOutlierClick}
        />
        <OrbitControls enableDamping dampingFactor={0.1} rotateSpeed={0.5} />
      </Canvas>
    </Container>
  );
}
