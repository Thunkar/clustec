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

const GROUP_GAP = 6;
const PAD_X = 6;
const PAD_TOP = 14;
const PAD_BOT = 50;
const ZERO_COLOR = "#555570"; // visible muted color for zero-value stubs
const EQUAL_COLOR = "#9999ff"; // color for equal bars in comparison view

function hashToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 7) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 360;
}

// Second independent hash — uses different mixing constants
function hashToPattern(s: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 6;
}

/**
 * Returns SVG <pattern> children for a fee-payer bar.
 * Patterns (indexed 0-5): diagonal-45, diagonal-135, horizontal, vertical,
 * checkerboard, diagonal-checkerboard.
 */
function feePayerPattern(
  id: string,
  patternIndex: number,
  color: string,
): React.ReactElement {
  switch (patternIndex) {
    case 0: // diagonal /
      return (
        <pattern
          key={id}
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="2" height="4" fill={color} />
        </pattern>
      );
    case 1: // diagonal \
      return (
        <pattern
          key={id}
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <rect width="2" height="4" fill={color} />
        </pattern>
      );
    case 2: // horizontal stripes
      return (
        <pattern
          key={id}
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="4" height="2" fill={color} />
        </pattern>
      );
    case 3: // vertical stripes
      return (
        <pattern
          key={id}
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="2" height="4" fill={color} />
        </pattern>
      );
    case 4: // checkerboard
      return (
        <pattern
          key={id}
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="2" height="2" fill={color} />
          <rect x="2" y="2" width="2" height="2" fill={color} />
        </pattern>
      );
    default: // checkerboard diagonal
      return (
        <pattern
          key={id}
          id={id}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="3" fill={color} />
          <rect x="3" y="3" width="3" height="3" fill={color} />
        </pattern>
      );
  }
}

function normalizeNumeric(
  value: number,
  index: number,
  maxValues?: number[],
): number {
  if (maxValues && maxValues[index] > 0) {
    return Math.sqrt(Math.min(value / maxValues[index], 1));
  }
  const caps: Record<number, number> = {
    0: 64, // numNoteHashes — MAX_NOTE_HASHES_PER_TX
    1: 64, // numNullifiers — MAX_NULLIFIERS_PER_TX
    2: 8, // numL2ToL1Msgs — MAX_L2_TO_L1_MSGS_PER_TX
    3: 64, // numPrivateLogs — MAX_PRIVATE_LOGS_PER_TX
    4: 1, // numContractClassLogs — MAX_CONTRACT_CLASS_LOGS_PER_TX
    5: 64, // numPublicLogs — practical cap; DA-derived max ~85 @ 16 fields/log avg
    6: 786_432, // gasLimitDa — MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT
    7: 6_540_000, // gasLimitL2 — MAX_PROCESSABLE_L2_GAS
    8: 1e9, // maxFeePerDaGas — 1 gwei/gas → max fee ~$0.25 DA at $2500/ETH
    9: 1e9, // maxFeePerL2Gas — 1 gwei/gas → max fee ~$16 L2 at $2500/ETH
    10: 32, // numSetupCalls — MAX_ENQUEUED_CALLS_PER_TX
    11: 32, // numAppCalls — MAX_ENQUEUED_CALLS_PER_TX
    12: 1_000, // totalPublicCalldataSize (fields) — practical cap; AVM bench test max is 300/call
    13: 172_800, // expirationDelta (seconds) — 48h max
  };
  const cap = caps[index] ?? 1;
  return Math.sqrt(Math.min(value / cap, 1));
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
  const barW = barSpacing * 0.88;

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
 * Combined bar path: a single shape spanning both up and down from centerY,
 * rounded only at the outer tips. No seam at center.
 */
function barPathDouble(
  x: number,
  centerY: number,
  w: number,
  hUp: number,
  hDown: number,
  r: number,
): string {
  const crUp = Math.min(r, w / 2, hUp);
  const crDown = Math.min(r, w / 2, hDown);
  const top = centerY - hUp;
  const bot = centerY + hDown;
  // Start top-left, go CCW: top edge with rounded corners, right side down, bottom rounded, left side up
  return [
    `M${x},${top + crUp}`,
    `Q${x},${top} ${x + crUp},${top}`,
    `L${x + w - crUp},${top}`,
    `Q${x + w},${top} ${x + w},${top + crUp}`,
    `L${x + w},${bot - crDown}`,
    `Q${x + w},${bot} ${x + w - crDown},${bot}`,
    `L${x + crDown},${bot}`,
    `Q${x},${bot} ${x},${bot - crDown}`,
    "Z",
  ].join(" ");
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
  showLabels,
}: {
  vector: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  color: string;
  showLabels: boolean;
}) {
  const { centerY, maxBarH, barW, barX } = layout;
  const r = 2;
  const ZERO_H = 2;
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < vector.length; i++) {
    const x = barX(i);
    const isCategorical = i === 14;
    const tooltip = `${FEATURE_LABELS[i]}: ${formatValue(vector[i], i)}`;

    if (isCategorical) {
      const addr = String(vector[i]);
      const barH = maxBarH * 0.5;
      const hue = hashToHue(addr);
      const patIdx = hashToPattern(addr);
      const catColor = `hsl(${hue}, 65%, 55%)`;
      const patId = `fp-pat-${hue}-${patIdx}`;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          <defs>{feePayerPattern(patId, patIdx, catColor)}</defs>
          <path
            d={barPathDouble(x, centerY, barW, barH, barH, r)}
            fill={`url(#${patId})`}
          />
          <path
            d={barPathDouble(x, centerY, barW, barH, barH, r)}
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
            d={barPathDouble(x, centerY, barW, barH, barH, r)}
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
  const r = 2;
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
      const barH = maxBarH * 0.5;
      const hueA = hashToHue(addrA);
      const hueB = hashToHue(addrB);
      const patIdxA = hashToPattern(addrA);
      const patIdxB = hashToPattern(addrB);
      const catColorA = `hsl(${hueA}, 65%, 55%)`;
      const catColorB = `hsl(${hueB}, 65%, 55%)`;
      const sameAddr = addrA === addrB;
      const patIdA = `fp-pat-${hueA}-${patIdxA}`;
      const patIdB = `fp-pat-${hueB}-${patIdxB}`;
      // When different: two equal-width bars side by side with a 1px gap
      const gap = sameAddr ? 0 : 1;
      const halfW = sameAddr ? barW : (barW - gap) / 2;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          <defs>
            {feePayerPattern(patIdA, patIdxA, catColorA)}
            {!sameAddr && feePayerPattern(patIdB, patIdxB, catColorB)}
          </defs>
          {/* A bar */}
          <path
            d={barPathDouble(x, centerY, halfW, barH, barH, r)}
            fill={`url(#${patIdA})`}
          />
          <path
            d={barPathDouble(x, centerY, halfW, barH, barH, r)}
            fill="none"
            stroke={catColorA}
            strokeWidth="0.6"
            opacity="0.5"
          />
          {/* B bar (only if different address) */}
          {!sameAddr && (
            <>
              <path
                d={barPathDouble(
                  x + halfW + gap,
                  centerY,
                  halfW,
                  barH,
                  barH,
                  r,
                )}
                fill={`url(#${patIdB})`}
              />
              <path
                d={barPathDouble(
                  x + halfW + gap,
                  centerY,
                  halfW,
                  barH,
                  barH,
                  r,
                )}
                fill="none"
                stroke={catColorB}
                strokeWidth="0.6"
                opacity="0.5"
              />
            </>
          )}
          {/* Invisible hit area */}
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
              fill={catColorA}
              fontWeight="600"
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
      const equal = rawA === rawB;

      const anyActive = activeA || activeB;

      elements.push(
        <g key={i}>
          <title>{tooltip}</title>
          {equal ? (
            /* Equal: symmetric barPathDouble with muted outline */
            <path
              d={barPathDouble(x, centerY, barW, barHA, barHA, r)}
              fill={anyActive ? EQUAL_COLOR : ZERO_COLOR}
              fillOpacity={anyActive ? 0.18 : 0.08}
              stroke={anyActive ? EQUAL_COLOR : ZERO_COLOR}
              strokeWidth="0.8"
              strokeOpacity={anyActive ? 0.75 : 0.35}
            />
          ) : (
            (() => {
              /* Different: upper half = A (colorA), lower half = B (colorB)
               Use two clipRects + the same outline path to split colors. */
              const clipIdUp = `clip-up-${i}`;
              const clipIdDn = `clip-dn-${i}`;
              const d = barPathDouble(x, centerY, barW, barHA, barHB, r);
              const top = centerY - barHA;
              return (
                <>
                  <defs>
                    <clipPath id={clipIdUp}>
                      <rect
                        x={x - 1}
                        y={top - 1}
                        width={barW + 2}
                        height={barHA + 1}
                      />
                    </clipPath>
                    <clipPath id={clipIdDn}>
                      <rect
                        x={x - 1}
                        y={centerY}
                        width={barW + 2}
                        height={barHB + 1}
                      />
                    </clipPath>
                  </defs>
                  <path
                    d={d}
                    fill={activeA ? colorA : ZERO_COLOR}
                    opacity={activeA ? 0.85 : 0.4}
                    clipPath={`url(#${clipIdUp})`}
                  />
                  <path
                    d={d}
                    fill={activeB ? colorB : ZERO_COLOR}
                    opacity={activeB ? 0.85 : 0.4}
                    clipPath={`url(#${clipIdDn})`}
                  />
                </>
              );
            })()
          )}
          {/* Invisible hit area */}
          <rect
            x={x}
            y={centerY - Math.max(barHA, barHB, 6)}
            width={barW}
            height={Math.max(barHA, barHB, 6) * 2}
            fill="transparent"
          />
          {showLabels && (
            <text
              x={0}
              y={0}
              transform={`translate(${x + barW * 0.3}, ${centerY + maxBarH + 6}) rotate(65)`}
              fontSize="6"
              fontFamily="'SF Mono', 'Fira Code', monospace"
              fill={
                activeA || activeB ? theme.colors.text : theme.colors.textMuted
              }
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

const VB_W = 500;
const VB_H_LABELS = 200;
const VB_H_COMPACT = 100;
const VB_H_NO_LABELS = 90;

// ── Public components ──

export interface TxFingerprintProps {
  vector: (number | string)[];
  maxValues?: number[];
  width?: number;
  height?: number;
  color?: string;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

export function TxFingerprint({
  vector,
  maxValues,
  color = theme.colors.primary,
  showLabels = false,
  compact = false,
  className,
}: TxFingerprintProps) {
  const vbH = compact
    ? VB_H_COMPACT
    : showLabels
      ? VB_H_LABELS
      : VB_H_NO_LABELS;
  const vbHMobile = VB_H_NO_LABELS;
  const layout = computeLayout(vector.length, VB_W, vbH, showLabels);
  const layoutMobile = computeLayout(vector.length, VB_W, vbHMobile, false);

  if (!showLabels) {
    return (
      <ResponsiveSvg
        viewBox={`0 0 ${VB_W} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className={className}
      >
        {renderBars({ vector, maxValues, layout, color, showLabels: false })}
      </ResponsiveSvg>
    );
  }

  return (
    <div className={className}>
      {/* Desktop: SVG with rotated text labels */}
      <DesktopOnly>
        <ResponsiveSvg
          viewBox={`0 0 ${VB_W} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {renderGroupLabelsAndSeparators(layout)}
          {renderBars({ vector, maxValues, layout, color, showLabels: true })}
        </ResponsiveSvg>
      </DesktopOnly>
      {/* Mobile: bars only, no labels */}
      <MobileOnly>
        <ResponsiveSvg
          viewBox={`0 0 ${VB_W} ${vbHMobile}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {renderBars({
            vector,
            maxValues,
            layout: layoutMobile,
            color,
            showLabels: false,
          })}
        </ResponsiveSvg>
      </MobileOnly>
    </div>
  );
}

export interface FingerprintCompareProps {
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

export function FingerprintCompare({
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
}: FingerprintCompareProps) {
  const vbH = compact
    ? VB_H_COMPACT
    : showLabels
      ? VB_H_LABELS
      : VB_H_NO_LABELS;
  const layout = computeLayout(vectorA.length, VB_W, vbH, showLabels);

  if (!showLabels) {
    return (
      <ResponsiveSvg
        viewBox={`0 0 ${VB_W} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className={className}
      >
        {renderComparisonBars({
          vectorA,
          vectorB,
          maxValues,
          layout,
          colorA,
          colorB,
          labelA,
          labelB,
          showLabels: false,
        })}
      </ResponsiveSvg>
    );
  }

  const vbHMobile = VB_H_NO_LABELS;
  const layoutMobile = computeLayout(vectorA.length, VB_W, vbHMobile, false);

  return (
    <div className={className}>
      {/* Desktop */}
      <DesktopOnly>
        <ResponsiveSvg
          viewBox={`0 0 ${VB_W} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {renderGroupLabelsAndSeparators(layout)}
          {renderComparisonBars({
            vectorA,
            vectorB,
            maxValues,
            layout,
            colorA,
            colorB,
            labelA,
            labelB,
            showLabels: true,
          })}
        </ResponsiveSvg>
      </DesktopOnly>
      {/* Mobile: bars only */}
      <MobileOnly>
        <ResponsiveSvg
          viewBox={`0 0 ${VB_W} ${vbHMobile}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {renderComparisonBars({
            vectorA,
            vectorB,
            maxValues,
            layout: layoutMobile,
            colorA,
            colorB,
            labelA,
            labelB,
            showLabels: false,
          })}
        </ResponsiveSvg>
      </MobileOnly>
    </div>
  );
}

/** Hook to export SVG as PNG data URL */
export function useFingerprintSnapshot(
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

export function SnapshotableFingerprint({
  vector,
  maxValues,
  color = theme.colors.primary,
  showLabels = true,
  label,
  className,
}: TxFingerprintProps & { label?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const snapshot = useFingerprintSnapshot(svgRef);

  const handleDownload = useCallback(async () => {
    const dataUrl = await snapshot(3);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = label ? `tx-fingerprint-${label}.png` : "tx-fingerprint.png";
    a.click();
  }, [snapshot, label]);

  const vbH = showLabels ? VB_H_LABELS : VB_H_NO_LABELS;
  const vbHCompact = VB_H_NO_LABELS;
  const layout = computeLayout(vector.length, VB_W, vbH, showLabels);
  const layoutCompact = computeLayout(vector.length, VB_W, vbHCompact, false);

  return (
    <SnapshotWrapper className={className}>
      {/* Desktop: full SVG with labels */}
      <DesktopOnly>
        <ResponsiveSvg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width={VB_W} height={vbH} fill={theme.colors.bgCard} rx="8" />
          {showLabels && renderGroupLabelsAndSeparators(layout)}
          {renderBars({ vector, maxValues, layout, color, showLabels })}
        </ResponsiveSvg>
      </DesktopOnly>
      {/* Mobile: bars only, no labels */}
      <MobileOnly>
        <ResponsiveSvg
          viewBox={`0 0 ${VB_W} ${vbHCompact}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <rect
            width={VB_W}
            height={vbHCompact}
            fill={theme.colors.bgCard}
            rx="8"
          />
          {renderBars({
            vector,
            maxValues,
            layout: layoutCompact,
            color,
            showLabels: false,
          })}
        </ResponsiveSvg>
      </MobileOnly>
      <DownloadButton onClick={handleDownload} title="Download as PNG">
        <DownloadIcon />
      </DownloadButton>
    </SnapshotWrapper>
  );
}

// ── Styled ──

const DesktopOnly = styled.div`
  flex: 1;
  min-height: 0;
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileOnly = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    flex: 1;
    min-height: 0;
  }
`;

const ResponsiveSvg = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
`;

const SnapshotWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;

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
