import { useState } from "react";
import styled from "@emotion/styled";
import { Link, Outlet, useLocation } from "react-router-dom";
import { theme } from "../lib/theme";
import { useNetworks } from "../api/hooks";
import { useNetworkStore } from "../stores/network";
import { Select } from "./ui";
import { ClustecLogo } from "./Logo";

const Shell = styled.div`
  display: flex;
  min-height: 100vh;
`;

const Overlay = styled.div<{ visible: boolean }>`
  display: none;

  @media (max-width: 768px) {
    display: ${(p) => (p.visible ? "block" : "none")};
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 90;
  }
`;

const Sidebar = styled.nav<{ open: boolean }>`
  width: 220px;
  background: ${theme.colors.bgCard};
  border-right: 1px solid ${theme.colors.border};
  padding: ${theme.spacing.lg} 0;
  flex-shrink: 0;

  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
    transform: ${(p) => (p.open ? "translateX(0)" : "translateX(-100%)")};
    transition: transform 0.2s ease;
  }
`;

const LogoWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: 0 ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};
`;

const LogoText = styled.span`
  font-size: ${theme.fontSize.lg};
  font-weight: 800;
  color: ${theme.colors.primary};
  margin-left: 5px;
  letter-spacing: -0.5px;
`;

const NavItem = styled(Link)<{ active?: boolean }>`
  display: block;
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  color: ${(p) => (p.active ? theme.colors.text : theme.colors.textMuted)};
  text-decoration: none;
  font-size: ${theme.fontSize.sm};
  font-weight: ${(p) => (p.active ? 600 : 400)};
  background: ${(p) => (p.active ? theme.colors.bgHover : "transparent")};
  border-left: 3px solid
    ${(p) => (p.active ? theme.colors.primary : "transparent")};

  &:hover {
    background: ${theme.colors.bgHover};
    color: ${theme.colors.text};
  }
`;

const NetworkSelector = styled.div`
  padding: 0 ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};
`;

const Main = styled.main`
  flex: 1;
  overflow-x: hidden;
  min-width: 0;
`;

const MobileHeader = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.md};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    background: ${theme.colors.bgCard};
    border-bottom: 1px solid ${theme.colors.border};
    position: sticky;
    top: 0;
    z-index: 50;
  }
`;

const HamburgerButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text};
  font-size: 24px;
  cursor: pointer;
  padding: ${theme.spacing.xs};
  line-height: 1;
`;

const MobileLogo = styled.span`
  font-size: ${theme.fontSize.md};
  font-weight: 800;
  color: ${theme.colors.primary};
  letter-spacing: -0.5px;
`;

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/txs", label: "Transactions" },
  { path: "/privacy-sets", label: "Privacy Sets" },
  { path: "/labels", label: "Labels" },
  { path: "/my-txs", label: "My Transactions" },
];

export function Layout() {
  const location = useLocation();
  const { data: networks } = useNetworks();
  const { selectedNetwork, setNetwork } = useNetworkStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <Shell>
      <Overlay visible={sidebarOpen} onClick={closeSidebar} />
      <Sidebar open={sidebarOpen}>
        <LogoWrapper>
          <ClustecLogo size={32} />
          <LogoText>Clustec</LogoText>
        </LogoWrapper>
        <NetworkSelector>
          <Select
            value={selectedNetwork}
            onChange={(e) => setNetwork(e.target.value)}
            style={{ width: "100%" }}
          >
            {networks?.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </NetworkSelector>
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            to={item.path}
            active={location.pathname === item.path}
            onClick={closeSidebar}
          >
            {item.label}
          </NavItem>
        ))}
      </Sidebar>
      <Main>
        <MobileHeader>
          <HamburgerButton onClick={() => setSidebarOpen(true)}>
            &#9776;
          </HamburgerButton>
          <ClustecLogo size={24} />
          <MobileLogo>clustec</MobileLogo>
        </MobileHeader>
        <Outlet />
      </Main>
    </Shell>
  );
}
