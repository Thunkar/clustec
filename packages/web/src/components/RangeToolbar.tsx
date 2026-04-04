import styled from "@emotion/styled";
import { theme } from "../lib/theme";

export interface RangeToolbarProps {
  ranges: { key: string; label: string; mobileHidden?: boolean }[];
  activeRange: string | null;
  onRangeSelect: (key: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoToLatest: () => void;
  showArrows?: boolean;
}

export function RangeToolbar({
  ranges,
  activeRange,
  onRangeSelect,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onGoToLatest,
  showArrows = true,
}: RangeToolbarProps) {
  return (
    <Controls>
      <LatestButton title="Go to latest" onClick={onGoToLatest}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: "rotate(-90deg)" }}>
          <path d="M8 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 12l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </LatestButton>
      {showArrows && (
        <NavBtn disabled={!canGoBack} onClick={onGoBack}>
          &#x25C0;
        </NavBtn>
      )}
      <Selector>
        {ranges.map((r) => (
          <RangeBtn
            key={r.key}
            active={activeRange === r.key}
            mobileHidden={r.mobileHidden}
            onClick={() => onRangeSelect(r.key)}
          >
            {r.label}
          </RangeBtn>
        ))}
      </Selector>
      {showArrows && (
        <NavBtn disabled={!canGoForward} onClick={onGoForward}>
          &#x25B6;
        </NavBtn>
      )}
    </Controls>
  );
}

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};

  @media (max-width: 768px) {
    padding-bottom: ${theme.spacing.sm};
  }
`;

const LatestButton = styled.button`
  padding: 6px 8px;
  background: ${theme.colors.bgCard};
  color: ${theme.colors.textMuted};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
  &:hover {
    color: ${theme.colors.primary};
    background: ${theme.colors.bgHover};
  }
`;

const NavBtn = styled.button<{ disabled?: boolean }>`
  padding: 6px 10px;
  background: ${theme.colors.bgCard};
  color: ${(p) => (p.disabled ? theme.colors.border : theme.colors.textMuted)};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.sm};
  cursor: ${(p) => (p.disabled ? "default" : "pointer")};
  font-size: ${theme.fontSize.sm};
  line-height: 1;
  transition: color 0.15s, background 0.15s;
  &:hover:not(:disabled) {
    color: ${theme.colors.text};
    background: ${theme.colors.bgHover};
  }
`;

const Selector = styled.div`
  display: flex;
  gap: 2px;
  background: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.md};
  padding: 2px;
`;

const RangeBtn = styled.button<{ active: boolean; mobileHidden?: boolean }>`
  padding: 6px 12px;
  background: ${(p) => (p.active ? theme.colors.primary : "transparent")};
  color: ${(p) => (p.active ? "#fff" : theme.colors.textMuted)};
  border: none;
  border-radius: ${theme.radius.sm};
  cursor: pointer;
  font-size: ${theme.fontSize.xs};
  font-family: monospace;
  transition: background 0.15s, color 0.15s;
  &:hover {
    background: ${(p) =>
      p.active ? theme.colors.primary : theme.colors.bgHover};
    color: ${theme.colors.text};
  }
  @media (max-width: 768px) {
    ${(p) => p.mobileHidden && "display: none;"}
  }
`;
