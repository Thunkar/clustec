import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { theme } from "../lib/theme";
import { useLabelResolver } from "../hooks/useAddressResolver";
import { abbreviateHex } from "./TxTable";

const Wrapper = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const HexText = styled.span`
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: inherit;
`;

const LabelText = styled.span`
  font-size: inherit;
`;

const StyledLink = styled(Link)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
    color: ${theme.colors.primary};
  }
`;

const CopyBtn = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.textMuted};
  cursor: pointer;
  padding: 1px 3px;
  font-size: 11px;
  line-height: 1;
  border-radius: 3px;
  flex-shrink: 0;
  &:hover {
    color: ${theme.colors.text};
    background: ${theme.colors.bgHover};
  }
`;

/** Looks like an Aztec address: 0x-prefixed, 64+ hex chars */
function looksLikeAddress(v: string): boolean {
  return /^0x[0-9a-f]{64,}$/i.test(v);
}

interface HexDisplayProps {
  /** The full hex value (address, hash, etc.). Always used for copy and tooltip. */
  address: string;
  /**
   * How to display the value:
   * - "full" (default): show "Label (0x1234...abcd)" if labeled, else abbreviated hex
   * - "label": show only the label text if labeled, else abbreviated hex
   * - "hex": show only the abbreviated hex (ignore labels)
   */
  mode?: "full" | "label" | "hex";
  /**
   * Whether to link to the murder board for this address.
   * Defaults to true. Only renders a link when the value looks like an address.
   */
  link?: boolean;
  /** Whether to abbreviate the hex value. Defaults to true. */
  abbreviate?: boolean;
  className?: string;
}

export function HexDisplay({
  address,
  mode = "full",
  link = true,
  abbreviate = true,
  className,
}: HexDisplayProps) {
  const [copied, setCopied] = useState(false);
  const resolveLabel = useLabelResolver();
  const label = mode !== "hex" ? resolveLabel(address) : undefined;
  const isLinkable = link && looksLikeAddress(address);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  const hex = abbreviate ? abbreviateHex(address) : address;

  let content: React.ReactNode;
  if (!label || mode === "hex") {
    content = <HexText>{hex}</HexText>;
  } else if (mode === "label") {
    content = <LabelText>{label}</LabelText>;
  } else {
    content = (
      <>
        <LabelText>{label}</LabelText>
        <HexText style={{ color: theme.colors.textMuted }}>({hex})</HexText>
      </>
    );
  }

  if (isLinkable) {
    content = (
      <StyledLink
        to={`/murder-board?address=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </StyledLink>
    );
  }

  return (
    <Wrapper className={className} title={address}>
      {content}
      <CopyBtn onClick={handleCopy} title="Copy full value">
        {copied ? "\u2713" : "\u29C9"}
      </CopyBtn>
    </Wrapper>
  );
}
