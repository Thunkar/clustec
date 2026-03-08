import styled from "@emotion/styled";
import { theme } from "../lib/theme";

export const Card = styled.div`
  background: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.radius.lg};
  padding: ${theme.spacing.lg};
`;

export const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: ${theme.spacing.lg};
`;

export const PageTitle = styled.h1`
  font-size: ${theme.fontSize.xxl};
  font-weight: 700;
  margin-bottom: ${theme.spacing.lg};
`;

export const SectionTitle = styled.h2`
  font-size: ${theme.fontSize.lg};
  font-weight: 600;
  margin-bottom: ${theme.spacing.md};
`;

export const Grid = styled.div<{ columns?: number }>`
  display: grid;
  grid-template-columns: repeat(${(p) => p.columns ?? 3}, 1fr);
  gap: ${theme.spacing.md};

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

export const StatCard = styled(Card)`
  text-align: center;
`;

export const StatValue = styled.div`
  font-size: ${theme.fontSize.xl};
  font-weight: 700;
  color: ${theme.colors.primary};
`;

export const StatLabel = styled.div`
  font-size: ${theme.fontSize.sm};
  color: ${theme.colors.textMuted};
  margin-top: ${theme.spacing.xs};
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    text-align: left;
    border-bottom: 1px solid ${theme.colors.border};
    font-size: ${theme.fontSize.sm};
  }

  th {
    color: ${theme.colors.textMuted};
    font-weight: 600;
    font-size: ${theme.fontSize.xs};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  tr:hover td {
    background: ${theme.colors.bgHover};
  }
`;

export const Badge = styled.span<{ color?: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${theme.radius.sm};
  font-size: ${theme.fontSize.xs};
  font-weight: 600;
  background: ${(p) => p.color ?? theme.colors.primary}22;
  color: ${(p) => p.color ?? theme.colors.primary};
`;

export const Button = styled.button<{ variant?: "primary" | "ghost" | "danger" }>`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.radius.md};
  font-size: ${theme.fontSize.sm};
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;

  ${(p) => {
    switch (p.variant) {
      case "danger":
        return `
          background: ${theme.colors.danger}22;
          color: ${theme.colors.danger};
          &:hover { background: ${theme.colors.danger}44; }
        `;
      case "ghost":
        return `
          background: transparent;
          color: ${theme.colors.textMuted};
          &:hover { background: ${theme.colors.bgHover}; color: ${theme.colors.text}; }
        `;
      default:
        return `
          background: ${theme.colors.primary};
          color: white;
          &:hover { background: ${theme.colors.primaryHover}; }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Input = styled.input`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.bg};
  color: ${theme.colors.text};
  font-size: ${theme.fontSize.sm};
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
`;

export const Select = styled.select`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.bg};
  color: ${theme.colors.text};
  font-size: ${theme.fontSize.sm};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
`;

export const Mono = styled.span`
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: ${theme.fontSize.xs};
`;

export const Truncate = styled(Mono)`
  max-width: 180px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
`;

export const Flex = styled.div<{ gap?: string; align?: string; justify?: string }>`
  display: flex;
  gap: ${(p) => p.gap ?? theme.spacing.md};
  align-items: ${(p) => p.align ?? "center"};
  justify-content: ${(p) => p.justify ?? "flex-start"};
`;

export const Spinner = styled.div`
  width: 24px;
  height: 24px;
  border: 3px solid ${theme.colors.border};
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

export const Loading = () => (
  <Flex justify="center" style={{ padding: "48px" }}>
    <Spinner />
  </Flex>
);
