import React, { useRef, useCallback, useState } from "react";
import styled from "@emotion/styled";
import { theme } from "../lib/theme";
import { formatFJPerMana } from "../lib/format";

/**
 * Labels match the feature vector indices from features.ts:
 *  0: numNoteHashes, 1: numNullifiers, 2: numL2ToL1Msgs,
 *  3: numPrivateLogs, 4: numContractClassLogs, 5: numPublicLogs,
 *  6: gasLimitDa (DA mana limit), 7: gasLimitL2 (L2 mana limit), 8: maxFeePerDaGas (max fee/DA mana), 9: maxFeePerL2Gas (max fee/L2 mana),
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
  "DA Mana Limit",
  "L2 Mana Limit",
  "Max Fee/DA Mana",
  "Max Fee/L2 Mana",
  "Setup",
  "App",
  "Teardown",
  "Calldata Size",
  "Expiry",
  "Fee Payer",
];

const GROUPS = [
  { start: 0, end: 5, label: "Counts" },
  { start: 6, end: 9, label: "Mana" },
  { start: 10, end: 13, label: "Pub Calls" },
  { start: 14, end: 14, label: "Time" },
  { start: 15, end: 15, label: "Identity" },
];

const GROUP_GAP = 6;
const PAD_X = 6;
const PAD_TOP = 14;
const PAD_BOT = 55;
const ZERO_COLOR = "#555570";
const EQUAL_COLOR = "#9999ff";

function hashToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 7) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 360;
}

function hashToPattern(s: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 6;
}

function feePayerPattern(
  id: string,
  patternIndex: number,
  color: string,
): React.ReactElement {
  switch (patternIndex) {
    case 0:
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
    case 1:
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
    case 2:
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
    case 3:
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
    case 4:
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
    default:
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
    5: 64, // numPublicLogs — practical cap
    6: 786_432, // gasLimitDa — MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT
    7: 6_540_000, // gasLimitL2 — MAX_PROCESSABLE_L2_GAS
    8: 1e16, // maxFeePerDaGas — FPA units per DA mana
    9: 1e16, // maxFeePerL2Gas — FPA units per L2 mana
    10: 32, // numSetupCalls — MAX_ENQUEUED_CALLS_PER_TX
    11: 32, // numAppCalls — MAX_ENQUEUED_CALLS_PER_TX
    12: 1, // hasTeardown — 0 or 1
    13: 1_000, // totalPublicCalldataSize (fields)
    14: 86400, // expirationDelta (seconds) — MAX_TX_LIFETIME
  };
  return Math.sqrt(Math.min(value / (caps[index] ?? 1), 1));
}

function computeLayout(
  numBars: number,
  viewWidth: number,
  viewHeight: number,
  withGroupLabels: boolean,
) {
  const topPad = withGroupLabels ? PAD_TOP : 4;
  const botPad = withGroupLabels ? PAD_BOT : 4;
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

function formatValue(value: number | string, index: number): string {
  if (index === 15) {
    const s = String(value);
    return s.length > 14 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
  }
  if (index === 8 || index === 9) {
    return `${formatFJPerMana(value)} FJ/mana`;
  }
  if (index === 12) {
    return value ? "Yes" : "No";
  }
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

// ── Tooltip ──

interface Tooltip {
  text: string;
  x: number;
  y: number;
}
type TooltipCallback = (
  text: string,
  barCenterX: number,
  barTopY: number,
) => void;

/** Delayed-show (hover) / instant (tap) tooltip state. */
function useTooltip(delayMs = 150) {
  const [tip, setTip] = useState<Tooltip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, x: number, y: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTip({ text, x, y }), delayMs);
    },
    [delayMs],
  );

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTip(null);
  }, []);

  const tap = useCallback((text: string, x: number, y: number) => {
    if (timer.current) clearTimeout(timer.current);
    setTip({ text, x, y });
  }, []);

  return { tip, show, hide, tap };
}

function TooltipOverlay({
  tip,
  vbW,
  vbH,
}: {
  tip: Tooltip;
  vbW: number;
  vbH: number;
}) {
  const lines = tip.text.split("\n");
  const lineH = 10;
  const padX = 6;
  const padY = 5;
  const boxW = Math.min(
    Math.max(...lines.map((l) => l.length)) * 5.5 + padX * 2,
    vbW - 8,
  );
  const boxH = lines.length * lineH + padY * 2;
  const bx = Math.max(4, Math.min(tip.x - boxW / 2, vbW - boxW - 4));
  const margin = 4;
  const by =
    tip.y - boxH - margin < 4
      ? Math.min(tip.y + margin, vbH - boxH - 4)
      : tip.y - boxH - margin;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={bx}
        y={by}
        width={boxW}
        height={boxH}
        rx="4"
        fill="#1a1a2e"
        stroke="#4444aa"
        strokeWidth="0.8"
        opacity="0.95"
      />
      {lines.map((line, idx) => (
        <text
          key={idx}
          x={bx + padX}
          y={by + padY + (idx + 0.75) * lineH}
          fontSize="8"
          fontFamily="'SF Mono', 'Fira Code', monospace"
          fill="#ccccff"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// ── Bar rendering helpers ──

function renderBars({
  vector,
  maxValues,
  layout,
  color,
  withGroupLabels,
  idScope = "",
  onTap,
  onHover,
  onHoverEnd,
}: {
  vector: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  color: string;
  withGroupLabels: boolean;
  idScope?: string;
  onTap: TooltipCallback;
  onHover: TooltipCallback;
  onHoverEnd: () => void;
}) {
  const { centerY, maxBarH, barW, barX } = layout;
  const r = 2;
  const ZERO_H = 2;
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < vector.length; i++) {
    const x = barX(i);
    const isCategorical = i === 15;
    const tooltip = `${FEATURE_LABELS[i]}: ${formatValue(vector[i], i)}`;
    const barCenterX = x + barW / 2;

    if (isCategorical) {
      const addr = String(vector[i]);
      const barH = maxBarH * 0.5;
      const barTopY = centerY - barH;
      const hue = hashToHue(addr);
      const patIdx = hashToPattern(addr);
      const catColor = `hsl(${hue}, 65%, 55%)`;
      const patId = `fp-pat-${idScope}-${hue}-${patIdx}`;

      elements.push(
        <g key={i}>
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
          <rect
            x={x}
            y={barTopY}
            width={barW}
            height={barH * 2}
            fill="transparent"
            onTouchStart={(e) => {
              e.stopPropagation();
              onTap(tooltip, barCenterX, barTopY);
            }}
            onMouseEnter={() => onHover(tooltip, barCenterX, barTopY)}
            onMouseLeave={onHoverEnd}
          />
          {withGroupLabels && (
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
      // Binary dims (hasTeardown): cap at 50% height like the categorical bar
      const effectiveMax = i === 12 ? maxBarH * 0.5 : maxBarH;
      const barH = active ? Math.max(norm * effectiveMax, 3) : ZERO_H;
      const hitH = Math.max(barH, 6);
      const barTopY = centerY - hitH;

      elements.push(
        <g key={i}>
          <path
            d={barPathDouble(x, centerY, barW, barH, barH, r)}
            fill={active ? color : ZERO_COLOR}
            opacity={active ? 0.85 : 0.5}
          />
          <rect
            x={x}
            y={barTopY}
            width={barW}
            height={hitH * 2}
            fill="transparent"
            onTouchStart={(e) => {
              e.stopPropagation();
              onTap(tooltip, barCenterX, barTopY);
            }}
            onMouseEnter={() => onHover(tooltip, barCenterX, barTopY)}
            onMouseLeave={onHoverEnd}
          />
          {withGroupLabels && (
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

function renderComparisonBars({
  vectorA,
  vectorB,
  maxValues,
  layout,
  colorA,
  colorB,
  labelA,
  labelB,
  withGroupLabels,
  idScope = "",
  onTap,
  onHover,
  onHoverEnd,
}: {
  vectorA: (number | string)[];
  vectorB: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
  withGroupLabels: boolean;
  idScope?: string;
  onTap: TooltipCallback;
  onHover: TooltipCallback;
  onHoverEnd: () => void;
}) {
  const { centerY, maxBarH, barW, barX } = layout;
  const r = 2;
  const ZERO_H = 2;
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < vectorA.length; i++) {
    const x = barX(i);
    const isCategorical = i === 15;
    const valA = formatValue(vectorA[i], i);
    const valB = formatValue(vectorB[i], i);
    const tooltip = `${FEATURE_LABELS[i]}\n${labelA}: ${valA}\n${labelB}: ${valB}`;
    const barCenterX = x + barW / 2;

    if (isCategorical) {
      const addrA = String(vectorA[i]);
      const addrB = String(vectorB[i]);
      const barH = maxBarH * 0.5;
      const barTopY = centerY - barH;
      const hueA = hashToHue(addrA);
      const hueB = hashToHue(addrB);
      const patIdxA = hashToPattern(addrA);
      const patIdxB = hashToPattern(addrB);
      const catColorA = `hsl(${hueA}, 65%, 55%)`;
      const catColorB = `hsl(${hueB}, 65%, 55%)`;
      const sameAddr = addrA === addrB;
      const patIdA = `fp-pat-${idScope}-${hueA}-${patIdxA}`;
      const patIdB = `fp-pat-${idScope}-${hueB}-${patIdxB}`;
      const gap = sameAddr ? 0 : 1;
      const halfW = sameAddr ? barW : (barW - gap) / 2;

      elements.push(
        <g key={i}>
          <defs>
            {feePayerPattern(patIdA, patIdxA, catColorA)}
            {!sameAddr && feePayerPattern(patIdB, patIdxB, catColorB)}
          </defs>
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
          <rect
            x={x}
            y={barTopY}
            width={barW}
            height={barH * 2}
            fill="transparent"
            onTouchStart={(e) => {
              e.stopPropagation();
              onTap(tooltip, barCenterX, barTopY);
            }}
            onMouseEnter={() => onHover(tooltip, barCenterX, barTopY)}
            onMouseLeave={onHoverEnd}
          />
          {withGroupLabels && (
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
      const effectiveMax = i === 12 ? maxBarH * 0.5 : maxBarH;
      const barHA = activeA ? Math.max(normA * effectiveMax, 3) : ZERO_H;
      const barHB = activeB ? Math.max(normB * effectiveMax, 3) : ZERO_H;
      const equal = rawA === rawB;
      const anyActive = activeA || activeB;
      const hitH = Math.max(barHA, barHB, 6);
      const barTopY = centerY - hitH;

      elements.push(
        <g key={i}>
          {equal ? (
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
              const clipIdUp = `clip-up-${idScope}-${i}`;
              const clipIdDn = `clip-dn-${idScope}-${i}`;
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
          <rect
            x={x}
            y={barTopY}
            width={barW}
            height={hitH * 2}
            fill="transparent"
            onTouchStart={(e) => {
              e.stopPropagation();
              onTap(tooltip, barCenterX, barTopY);
            }}
            onMouseEnter={() => onHover(tooltip, barCenterX, barTopY)}
            onMouseLeave={onHoverEnd}
          />
          {withGroupLabels && (
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
const VB_H_FULL = 200; // with group labels + bar axis labels
const VB_H_COMPACT = 90; // bars only

// ── SVG building blocks — each one handles its own tooltip state ──

/**
 * Single-tx bars, full height with group/axis labels. Desktop hover tooltip.
 */
function FullBarsSvg({
  vector,
  maxValues,
  layout,
  color,
  vbH,
  idScope,
  svgRef,
  extraSvgProps,
}: {
  vector: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  color: string;
  vbH: number;
  idScope: string;
  svgRef?: React.Ref<SVGSVGElement>;
  extraSvgProps?: React.SVGProps<SVGSVGElement>;
}) {
  const tt = useTooltip();
  return (
    <ResponsiveSvg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={tt.hide}
      {...extraSvgProps}
    >
      {extraSvgProps?.children}
      {renderGroupLabelsAndSeparators(layout)}
      {renderBars({
        vector,
        maxValues,
        layout,
        color,
        withGroupLabels: true,
        idScope,
        onTap: tt.tap,
        onHover: tt.show,
        onHoverEnd: tt.hide,
      })}
      {tt.tip && <TooltipOverlay tip={tt.tip} vbW={VB_W} vbH={vbH} />}
    </ResponsiveSvg>
  );
}

/**
 * Single-tx bars, compact (no labels). Both hover and tap tooltips.
 */
function CompactBarsSvg({
  vector,
  maxValues,
  layout,
  color,
  vbH,
  idScope,
  className,
  svgRef,
  extraSvgProps,
}: {
  vector: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  color: string;
  vbH: number;
  idScope: string;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
  extraSvgProps?: React.SVGProps<SVGSVGElement>;
}) {
  const tt = useTooltip();
  return (
    <ResponsiveSvg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      onMouseLeave={tt.hide}
      onTouchStart={() => tt.hide()}
      {...extraSvgProps}
    >
      {extraSvgProps?.children}
      {renderBars({
        vector,
        maxValues,
        layout,
        color,
        withGroupLabels: false,
        idScope,
        onTap: tt.tap,
        onHover: tt.show,
        onHoverEnd: tt.hide,
      })}
      {tt.tip && <TooltipOverlay tip={tt.tip} vbW={VB_W} vbH={vbH} />}
    </ResponsiveSvg>
  );
}

/**
 * Comparison bars, full height with group/axis labels. Desktop hover tooltip.
 */
function FullCompareSvg({
  vectorA,
  vectorB,
  maxValues,
  layout,
  colorA,
  colorB,
  labelA,
  labelB,
  vbH,
  idScope,
}: {
  vectorA: (number | string)[];
  vectorB: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
  vbH: number;
  idScope: string;
}) {
  const tt = useTooltip();
  return (
    <ResponsiveSvg
      viewBox={`0 0 ${VB_W} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={tt.hide}
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
        withGroupLabels: true,
        idScope,
        onTap: tt.tap,
        onHover: tt.show,
        onHoverEnd: tt.hide,
      })}
      {tt.tip && <TooltipOverlay tip={tt.tip} vbW={VB_W} vbH={vbH} />}
    </ResponsiveSvg>
  );
}

/**
 * Comparison bars, compact (no labels). Both hover and tap tooltips.
 */
function CompactCompareSvg({
  vectorA,
  vectorB,
  maxValues,
  layout,
  colorA,
  colorB,
  labelA,
  labelB,
  vbH,
  idScope,
  className,
}: {
  vectorA: (number | string)[];
  vectorB: (number | string)[];
  maxValues?: number[];
  layout: ReturnType<typeof computeLayout>;
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
  vbH: number;
  idScope: string;
  className?: string;
}) {
  const tt = useTooltip();
  return (
    <ResponsiveSvg
      viewBox={`0 0 ${VB_W} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      onMouseLeave={tt.hide}
      onTouchStart={() => tt.hide()}
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
        withGroupLabels: false,
        idScope,
        onTap: tt.tap,
        onHover: tt.show,
        onHoverEnd: tt.hide,
      })}
      {tt.tip && <TooltipOverlay tip={tt.tip} vbW={VB_W} vbH={vbH} />}
    </ResponsiveSvg>
  );
}

// ── Public components ──

export interface TxFingerprintProps {
  vector: (number | string)[];
  maxValues?: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Show group + axis labels. On mobile, always renders compact regardless. */
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Single-tx fingerprint.
 * - `showLabels=false` (default): compact bars, hover+tap tooltips on all screen sizes.
 * - `showLabels=true`: desktop shows full labeled view; mobile shows compact bars.
 */
export function TxFingerprint({
  vector,
  maxValues,
  color = theme.colors.primary,
  showLabels = false,
  compact = false,
  className,
}: TxFingerprintProps) {
  const vbH = compact ? VB_H_COMPACT : showLabels ? VB_H_FULL : VB_H_COMPACT;
  const layout = computeLayout(
    vector.length,
    VB_W,
    vbH,
    showLabels && !compact,
  );

  if (!showLabels || compact) {
    // Compact: single SVG for all screen sizes, hover+tap both work
    return (
      <CompactBarsSvg
        vector={vector}
        maxValues={maxValues}
        layout={layout}
        color={color}
        vbH={vbH}
        idScope="c"
        className={className}
      />
    );
  }

  // Full labeled: desktop gets full view, mobile gets compact bars
  const compactLayout = computeLayout(vector.length, VB_W, VB_H_COMPACT, false);
  return (
    <div className={className}>
      <DesktopOnly>
        <FullBarsSvg
          vector={vector}
          maxValues={maxValues}
          layout={layout}
          color={color}
          vbH={vbH}
          idScope="d"
        />
      </DesktopOnly>
      <MobileOnly>
        <CompactBarsSvg
          vector={vector}
          maxValues={maxValues}
          layout={compactLayout}
          color={color}
          vbH={VB_H_COMPACT}
          idScope="m"
        />
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
  /** Show group + axis labels. On mobile, always renders compact regardless. */
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Two-tx comparison fingerprint.
 * - `showLabels=false` (default): compact bars, hover+tap tooltips on all screen sizes.
 * - `showLabels=true`: desktop shows full labeled view; mobile shows compact bars.
 */
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
  const vbH = compact ? VB_H_COMPACT : showLabels ? VB_H_FULL : VB_H_COMPACT;
  const layout = computeLayout(
    vectorA.length,
    VB_W,
    vbH,
    showLabels && !compact,
  );

  if (!showLabels || compact) {
    return (
      <CompactCompareSvg
        vectorA={vectorA}
        vectorB={vectorB}
        maxValues={maxValues}
        layout={layout}
        colorA={colorA}
        colorB={colorB}
        labelA={labelA}
        labelB={labelB}
        vbH={vbH}
        idScope="cc"
        className={className}
      />
    );
  }

  const compactLayout = computeLayout(
    vectorA.length,
    VB_W,
    VB_H_COMPACT,
    false,
  );
  return (
    <div className={className}>
      <DesktopOnly>
        <FullCompareSvg
          vectorA={vectorA}
          vectorB={vectorB}
          maxValues={maxValues}
          layout={layout}
          colorA={colorA}
          colorB={colorB}
          labelA={labelA}
          labelB={labelB}
          vbH={vbH}
          idScope="cd"
        />
      </DesktopOnly>
      <MobileOnly>
        <CompactCompareSvg
          vectorA={vectorA}
          vectorB={vectorB}
          maxValues={maxValues}
          layout={compactLayout}
          colorA={colorA}
          colorB={colorB}
          labelA={labelA}
          labelB={labelB}
          vbH={VB_H_COMPACT}
          idScope="cm"
        />
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
          canvas.height = VB_H_FULL * scale;
          const ctx = canvas.getContext("2d")!;
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, VB_W, VB_H_FULL);
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

  const vbH = showLabels ? VB_H_FULL : VB_H_COMPACT;
  const layout = computeLayout(vector.length, VB_W, vbH, showLabels);
  const compactLayout = computeLayout(vector.length, VB_W, VB_H_COMPACT, false);

  return (
    <SnapshotWrapper className={className}>
      <DesktopOnly>
        <FullBarsSvg
          vector={vector}
          maxValues={maxValues}
          layout={layout}
          color={color}
          vbH={vbH}
          idScope="sd"
          svgRef={svgRef}
          extraSvgProps={{
            xmlns: "http://www.w3.org/2000/svg",
            children: (
              <rect
                width={VB_W}
                height={vbH}
                fill={theme.colors.bgCard}
                rx="8"
              />
            ),
          }}
        />
      </DesktopOnly>
      <MobileOnly>
        <CompactBarsSvg
          vector={vector}
          maxValues={maxValues}
          layout={compactLayout}
          color={color}
          vbH={VB_H_COMPACT}
          idScope="sm"
          extraSvgProps={{
            children: (
              <rect
                width={VB_W}
                height={VB_H_COMPACT}
                fill={theme.colors.bgCard}
                rx="8"
              />
            ),
          }}
        />
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
