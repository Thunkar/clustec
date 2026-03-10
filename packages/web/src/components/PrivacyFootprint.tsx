import React, { useRef, useCallback } from "react";
import styled from "@emotion/styled";
import { theme } from "../lib/theme";

/**
 * Labels match the feature vector indices from features.ts:
 *  0: numNoteHashes, 1: numNullifiers, 2: numL2ToL1Msgs,
 *  3: numPrivateLogs, 4: numContractClassLogs, 5: numPublicLogs,
 *  6: gasLimitDa, 7: gasLimitL2, 8: maxFeePerDaGas, 9: maxFeePerL2Gas,
 * 10: numSetupCalls, 11: numAppCalls, 12: totalPublicCalldataSize,
 * 13: expirationDelta, 14: feePayer
 */
const FEATURE_LABELS = [
  "Notes",
  "Nullifiers",
  "L2→L1",
  "Priv Logs",
  "Class Logs",
  "Pub Logs",
  "DA Limit",
  "L2 Limit",
  "Max Fee/DA Gas",
  "Max Fee/L2 Gas",
  "Setup",
  "App",
  "Calldata Size",
  "Expiry",
  "Fee Payer",
];

const GROUPS = [
  { start: 0, end: 5, label: "Counts" },
  { start: 6, end: 9, label: "Gas" },
  { start: 10, end: 12, label: "Pub Calls" },
  { start: 13, end: 13, label: "Time" },
  { start: 14, end: 14, label: "Identity" },
];

const GROUP_GAP = 10;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOT = 46;
const ZERO_COLOR = "#555570"; // visible muted color for zero-value stubs

function hashToUnit(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (((h >>> 0) % 1000) + 1) / 1000;
}

function hashToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 7) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 360;
}

function normalizeNumeric(
  value: number,
  index: number,
  maxValues?: number[],
): number {
  if (maxValues && maxValues[index] > 0) {
    return Math.min(value / maxValues[index], 1);
  }
  const caps: Record<number, number> = {
    0: 64,          // numNoteHashes
    1: 64,          // numNullifiers
    2: 16,          // numL2ToL1Msgs
    3: 64,          // numPrivateLogs
    4: 8,           // numContractClassLogs
    5: 64,          // numPublicLogs
    6: 2_000_000,   // gasLimitDa
    7: 20_000_000,  // gasLimitL2
    8: 100_000_000, // maxFeePerDaGas
    9: 500_000_000, // maxFeePerL2Gas
    10: 4,          // numSetupCalls
    11: 4,          // numAppCalls
    12: 10_000,     // totalPublicCalldataSize
    13: 100_000,    // expirationDelta (seconds)
  };
  const cap = caps[index] ?? 1;
  return Math.min(value / cap, 1);
}

function computeLayout(
  numBars: number,
  viewWidth: number,
  viewHeight: number,
  showLabels: boolean,
) {
  const topPad = showLabels ? PAD_TOP : 4;
  const botPad = showLabels ? PAD_BOT : 4;
  const waveArea = viewHeight - topPad - botPad;
  const centerY = topPad + waveArea / 2;
  const maxBarH = waveArea / 2 - 1;

  const numGaps = GROUPS.length - 1;
  const usableWidth = viewWidth - 2 * PAD_X - numGaps * GROUP_GAP;
  const barSpacing = usableWidth / numBars;
  const barW = barSpacing * 0.82;

  function barX(index: number): number {
    let x = PAD_X + index * barSpacing;
    for (const g of GROUPS) {
      if (index > g.end) x += GROUP_GAP;
    }
    return x;
  }

  return { centerY, maxBarH, barW, barSpacing, barX, topPad, botPad };
}

/**
 * Bar path: flat at center, rounded only at outer tip.
 */
function barPath(
  x: number,
  centerY: number,
  w: number,
  h: number,
  dir: -1 | 1,
  r: number,
): string {
  const cr = Math.min(r, w / 2, h);
  if (dir === -1) {
    const top = centerY - h;
    return `M${x},${centerY} L${x},${top + cr} Q${x},${top} ${x + cr},${top} L${x + w - cr},${top} Q${x + w},${top} ${x + w},${top + cr} L${x + w},${centerY} Z`;
  }
  const bot = centerY + h;
  return `M${x},${centerY} L${x + w},${centerY} L${x + w},${bot - cr} Q${x + w},${bot} ${x + w - cr},${bot} L${x + cr},${bot} Q${x},${bot} ${x},${bot - cr} Z`;
}

/** Format a value for tooltip display */
function formatValue(value: number | string, index: number): string {
  if (index === 14) {
    const s = String(value);
    return s.length > 14 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
  }
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

// ── Bar rendering (flat style) ──

function renderBars({
  vector,
  maxValues,
  layout,
  color,
  id,
  showLabels,
}: {
  vector: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  color: string;
  id: string;
  showLabels: boolean;
}) {
  const { centerY, maxBarH, barW, barX } = layout;
  const r = 3;
  const ZERO_H = 2;
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < vector.length; i++) {
    const x = barX(i);
    const isCategorical = i === 14;
    const tooltip = `${FEATURE_LABELS[i]}: ${formatValue(vector[i], i)}`;

    if (isCategorical) {
      const addr = String(vector[i]);
      const norm = hashToUnit(addr);
      const barH = Math.max(norm * maxBarH, 3);
      const hue = hashToHue(addr);
      const catColor = `hsl(${hue}, 65%, 55%)`;
      const patId = `${id}-hatch-${hue}`;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          <defs>
            <pattern
              id={patId}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="2" height="4" fill={catColor} />
            </pattern>
          </defs>
          <path
            d={barPath(x, centerY, barW, barH, -1, r)}
            fill={`url(#${patId})`}
          />
          <path
            d={barPath(x, centerY, barW, barH, 1, r)}
            fill={`url(#${patId})`}
          />
          <path
            d={barPath(x, centerY, barW, barH, -1, r)}
            fill="none"
            stroke={catColor}
            strokeWidth="0.6"
            opacity="0.5"
          />
          <path
            d={barPath(x, centerY, barW, barH, 1, r)}
            fill="none"
            stroke={catColor}
            strokeWidth="0.6"
            opacity="0.5"
          />
          {/* Invisible hit area for tooltip */}
          <rect
            x={x}
            y={centerY - barH}
            width={barW}
            height={barH * 2}
            fill="transparent"
          />
          {showLabels && (
            <text
              x={0}
              y={0}
              transform={`translate(${x + barW * 0.3}, ${centerY + maxBarH + 6}) rotate(65)`}
              fontSize="6"
              fontFamily="'SF Mono', 'Fira Code', monospace"
              fill={catColor}
              fontWeight="600"
            >
              {FEATURE_LABELS[i]}
            </text>
          )}
        </g>,
      );
    } else {
      const value = typeof vector[i] === "number" ? (vector[i] as number) : 0;
      const norm = normalizeNumeric(value, i, maxValues);
      const active = value > 0;
      const barH = active ? Math.max(norm * maxBarH, 3) : ZERO_H;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          <path
            d={barPath(x, centerY, barW, barH, -1, r)}
            fill={active ? color : ZERO_COLOR}
            opacity={active ? 0.85 : 0.5}
          />
          <path
            d={barPath(x, centerY, barW, barH, 1, r)}
            fill={active ? color : ZERO_COLOR}
            opacity={active ? 0.85 : 0.5}
          />
          {/* Invisible hit area for tooltip */}
          <rect
            x={x}
            y={centerY - Math.max(barH, 6)}
            width={barW}
            height={Math.max(barH, 6) * 2}
            fill="transparent"
          />
          {showLabels && (
            <text
              x={0}
              y={0}
              transform={`translate(${x + barW * 0.3}, ${centerY + maxBarH + 6}) rotate(65)`}
              fontSize="6"
              fontFamily="'SF Mono', 'Fira Code', monospace"
              fill={active ? theme.colors.text : theme.colors.textMuted}
              opacity={active ? 0.7 : 0.35}
            >
              {FEATURE_LABELS[i]}
            </text>
          )}
        </g>,
      );
    }
  }
  return elements;
}

/**
 * Render comparison bars with overlap.
 * The taller bar is always rendered first (behind) at full opacity.
 * The shorter bar is always rendered second (on top) at full opacity.
 * The visible "excess" of the taller bar shows the difference.
 */
function renderComparisonBars({
  vectorA,
  vectorB,
  maxValues,
  layout,
  colorA,
  colorB,
  labelA,
  labelB,
  showLabels,
}: {
  vectorA: (number | string)[];
  vectorB: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
  showLabels: boolean;
}) {
  const { centerY, maxBarH, barW, barX } = layout;
  const r = 3;
  const ZERO_H = 2;
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < vectorA.length; i++) {
    const x = barX(i);
    const isCategorical = i === 14;
    const valA = formatValue(vectorA[i], i);
    const valB = formatValue(vectorB[i], i);
    const tooltip = `${FEATURE_LABELS[i]}\n${labelA}: ${valA}\n${labelB}: ${valB}`;

    if (isCategorical) {
      const addrA = String(vectorA[i]);
      const addrB = String(vectorB[i]);
      const normA = hashToUnit(addrA);
      const normB = hashToUnit(addrB);
      const barHA = Math.max(normA * maxBarH, 3);
      const barHB = Math.max(normB * maxBarH, 3);
      const hueA = hashToHue(addrA);
      const hueB = hashToHue(addrB);
      const catColorA = `hsl(${hueA}, 65%, 55%)`;
      const catColorB = `hsl(${hueB}, 65%, 55%)`;
      const patIdA = `cmpA-hatch-${hueA}`;
      const patIdB = `cmpB-hatch-${hueB}`;

      // Render taller behind, shorter on top
      const aIsTaller = barHA >= barHB;
      const backH = aIsTaller ? barHA : barHB;
      const frontH = aIsTaller ? barHB : barHA;
      const backPat = aIsTaller ? patIdA : patIdB;
      const frontPat = aIsTaller ? patIdB : patIdA;
      const backColor = aIsTaller ? catColorA : catColorB;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          <defs>
            <pattern id={patIdA} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="4" fill={catColorA} />
            </pattern>
            <pattern id={patIdB} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="4" fill={catColorB} />
            </pattern>
          </defs>
          {/* Taller bar (behind) */}
          <path d={barPath(x, centerY, barW, backH, -1, r)} fill={`url(#${backPat})`} />
          <path d={barPath(x, centerY, barW, backH, 1, r)} fill={`url(#${backPat})`} />
          {/* Shorter bar (on top) */}
          <path d={barPath(x, centerY, barW, frontH, -1, r)} fill={`url(#${frontPat})`} />
          <path d={barPath(x, centerY, barW, frontH, 1, r)} fill={`url(#${frontPat})`} />
          {/* Invisible hit area */}
          <rect x={x} y={centerY - maxBarH} width={barW} height={maxBarH * 2} fill="transparent" />
          {showLabels && (
            <text
              x={0} y={0}
              transform={`translate(${x + barW * 0.3}, ${centerY + maxBarH + 6}) rotate(65)`}
              fontSize="6" fontFamily="'SF Mono', 'Fira Code', monospace"
              fill={backColor} fontWeight="600"
            >
              {FEATURE_LABELS[i]}
            </text>
          )}
        </g>,
      );
    } else {
      const rawA = typeof vectorA[i] === "number" ? (vectorA[i] as number) : 0;
      const rawB = typeof vectorB[i] === "number" ? (vectorB[i] as number) : 0;
      const normA = normalizeNumeric(rawA, i, maxValues);
      const normB = normalizeNumeric(rawB, i, maxValues);
      const activeA = rawA > 0;
      const activeB = rawB > 0;
      const barHA = activeA ? Math.max(normA * maxBarH, 3) : ZERO_H;
      const barHB = activeB ? Math.max(normB * maxBarH, 3) : ZERO_H;

      // Always render taller bar behind, shorter bar on top (both opaque)
      const aIsTaller = barHA >= barHB;
      const backH = aIsTaller ? barHA : barHB;
      const frontH = aIsTaller ? barHB : barHA;
      const backColor = aIsTaller ? colorA : colorB;
      const frontColor = aIsTaller ? colorB : colorA;
      const backActive = aIsTaller ? activeA : activeB;
      const frontActive = aIsTaller ? activeB : activeA;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          {/* Taller bar (behind, full opacity) */}
          <path d={barPath(x, centerY, barW, backH, -1, r)} fill={backActive ? backColor : ZERO_COLOR} opacity={backActive ? 0.85 : 0.4} />
          <path d={barPath(x, centerY, barW, backH, 1, r)} fill={backActive ? backColor : ZERO_COLOR} opacity={backActive ? 0.85 : 0.4} />
          {/* Shorter bar (on top, full opacity) */}
          <path d={barPath(x, centerY, barW, frontH, -1, r)} fill={frontActive ? frontColor : ZERO_COLOR} opacity={frontActive ? 0.85 : 0.4} />
          <path d={barPath(x, centerY, barW, frontH, 1, r)} fill={frontActive ? frontColor : ZERO_COLOR} opacity={frontActive ? 0.85 : 0.4} />
          {/* Invisible hit area */}
          <rect x={x} y={centerY - Math.max(barHA, barHB, 6)} width={barW} height={Math.max(barHA, barHB, 6) * 2} fill="transparent" />
          {showLabels && (
            <text
              x={0} y={0}
              transform={`translate(${x + barW * 0.3}, ${centerY + maxBarH + 6}) rotate(65)`}
              fontSize="6" fontFamily="'SF Mono', 'Fira Code', monospace"
              fill={activeA || activeB ? theme.colors.text : theme.colors.textMuted}
              opacity={activeA || activeB ? 0.7 : 0.35}
            >
              {FEATURE_LABELS[i]}
            </text>
          )}
        </g>,
      );
    }
  }
  return elements;
}

function renderGroupLabelsAndSeparators(
  layout: ReturnType<typeof computeLayout>,
) {
  const { barX, barW, centerY, maxBarH } = layout;
  const elements: React.ReactElement[] = [];

  for (let gi = 0; gi < GROUPS.length; gi++) {
    const g = GROUPS[gi];
    const x1 = barX(g.start);
    const x2 = barX(g.end) + barW;

    // Group label
    elements.push(
      <text
        key={`lbl-${g.label}`}
        x={(x1 + x2) / 2}
        y={10}
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="'SF Mono', 'Fira Code', monospace"
        fill={theme.colors.textMuted}
        letterSpacing="0.06em"
      >
        {g.label.toUpperCase()}
      </text>,
    );

    // Vertical separator line between groups
    if (gi < GROUPS.length - 1) {
      const nextX = barX(GROUPS[gi + 1].start);
      const sepX = (x2 + nextX) / 2;
      elements.push(
        <line
          key={`sep-${gi}`}
          x1={sepX}
          y1={centerY - maxBarH}
          x2={sepX}
          y2={centerY + maxBarH}
          stroke={theme.colors.border}
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />,
      );
    }
  }
  return elements;
}

// ── Viewbox dimensions ──

const VB_W = 700;
const VB_H_LABELS = 210;
const VB_H_COMPACT = 130;
const VB_H_NO_LABELS = 120;

// ── Public components ──

export interface PrivacyFootprintProps {
  vector: (number | string)[];
  maxValues?: number[];
  width?: number;
  height?: number;
  color?: string;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

export function PrivacyFootprint({
  vector,
  maxValues,
  color = theme.colors.primary,
  showLabels = false,
  compact = false,
  className,
}: PrivacyFootprintProps) {
  const vbH = compact
    ? VB_H_COMPACT
    : showLabels
      ? VB_H_LABELS
      : VB_H_NO_LABELS;
  const layout = computeLayout(vector.length, VB_W, vbH, showLabels);

  return (
    <ResponsiveSvg
      viewBox={`0 0 ${VB_W} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {showLabels && renderGroupLabelsAndSeparators(layout)}
      <line
        x1={PAD_X}
        y1={layout.centerY}
        x2={VB_W - PAD_X}
        y2={layout.centerY}
        stroke={theme.colors.border}
        strokeWidth={0.5}
        strokeDasharray="4 3"
      />
      {renderBars({ vector, maxValues, layout, color, id: "fp", showLabels })}
    </ResponsiveSvg>
  );
}

export interface FootprintCompareProps {
  vectorA: (number | string)[];
  vectorB: (number | string)[];
  maxValues?: number[];
  colorA?: string;
  colorB?: string;
  labelA?: string;
  labelB?: string;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

export function FootprintCompare({
  vectorA,
  vectorB,
  maxValues,
  colorA = theme.colors.primary,
  colorB = theme.colors.accent,
  labelA = "This TX",
  labelB = "Similar",
  showLabels = false,
  compact = false,
  className,
}: FootprintCompareProps) {
  const vbH = compact ? VB_H_COMPACT : showLabels ? VB_H_LABELS : VB_H_NO_LABELS;
  const layout = computeLayout(vectorA.length, VB_W, vbH, showLabels);

  return (
    <ResponsiveSvg
      viewBox={`0 0 ${VB_W} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {showLabels && renderGroupLabelsAndSeparators(layout)}
      <line
        x1={PAD_X}
        y1={layout.centerY}
        x2={VB_W - PAD_X}
        y2={layout.centerY}
        stroke={theme.colors.border}
        strokeWidth={0.5}
        strokeDasharray="4 3"
      />
      {renderComparisonBars({
        vectorA, vectorB, maxValues, layout,
        colorA, colorB, labelA, labelB, showLabels,
      })}
    </ResponsiveSvg>
  );
}

/** Hook to export SVG as PNG data URL */
export function useFootprintSnapshot(
  svgRef: React.RefObject<SVGSVGElement | null>,
) {
  return useCallback(
    (scale = 2): Promise<string> =>
      new Promise((resolve, reject) => {
        const svg = svgRef.current;
        if (!svg) return reject(new Error("No SVG ref"));

        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob(
          [`<?xml version="1.0" encoding="UTF-8"?>${svgData}`],
          { type: "image/svg+xml" },
        );
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = VB_W * scale;
          canvas.height = VB_H_LABELS * scale;
          const ctx = canvas.getContext("2d")!;
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, VB_W, VB_H_LABELS);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = url;
      }),
    [svgRef],
  );
}

export function SnapshotableFootprint({
  vector,
  maxValues,
  color = theme.colors.primary,
  showLabels = true,
  label,
  className,
}: PrivacyFootprintProps & { label?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const snapshot = useFootprintSnapshot(svgRef);

  const handleDownload = useCallback(async () => {
    const dataUrl = await snapshot(3);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = label
      ? `privacy-footprint-${label}.png`
      : "privacy-footprint.png";
    a.click();
  }, [snapshot, label]);

  const vbH = showLabels ? VB_H_LABELS : VB_H_NO_LABELS;
  const layout = computeLayout(vector.length, VB_W, vbH, showLabels);

  return (
    <SnapshotWrapper className={className}>
      <ResponsiveSvg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={VB_W} height={vbH} fill={theme.colors.bgCard} rx="8" />
        {showLabels && renderGroupLabelsAndSeparators(layout)}
        <line
          x1={PAD_X}
          y1={layout.centerY}
          x2={VB_W - PAD_X}
          y2={layout.centerY}
          stroke={theme.colors.border}
          strokeWidth={0.5}
          strokeDasharray="4 3"
        />
        {renderBars({
          vector,
          maxValues,
          layout,
          color,
          id: "snap",
          showLabels,
        })}
      </ResponsiveSvg>
      <DownloadButton onClick={handleDownload} title="Download as PNG">
        <DownloadIcon />
      </DownloadButton>
    </SnapshotWrapper>
  );
}

// ── Styled ──

const ResponsiveSvg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
`;

const SnapshotWrapper = styled.div`
  position: relative;

  &:hover button {
    opacity: 1;
  }
`;

const DownloadButton = styled.button`
  position: absolute;
  top: ${theme.spacing.sm};
  right: ${theme.spacing.sm};
  background: ${theme.colors.bg}cc;
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  padding: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${theme.colors.bgHover};
  }
`;

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2 11h10"
        stroke={theme.colors.textMuted}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
