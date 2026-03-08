import styled from "@emotion/styled";
import { Link, Outlet, useLocation } from "react-router-dom";
import { theme } from "../lib/theme";
import { useNetworks } from "../api/hooks";
import { useNetworkStore } from "../stores/network";
import { Select, Flex } from "./ui";

const Shell = styled.div`
  display: flex;
  min-height: 100vh;
`;

const Sidebar = styled.nav`
  width: 220px;
  background: ${theme.colors.bgCard};
  border-right: 1px solid ${theme.colors.border};
  padding: ${theme.spacing.lg} 0;
  flex-shrink: 0;
`;

const Logo = styled.div`
  font-size: ${theme.fontSize.lg};
  font-weight: 800;
  color: ${theme.colors.primary};
  padding: 0 ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};
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
  border-left: 3px solid ${(p) => (p.active ? theme.colors.primary : "transparent")};

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
`;

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/privacy-sets", label: "Privacy Sets" },
  { path: "/labels", label: "Labels" },
  { path: "/my-txs", label: "My Transactions" },
];

export function Layout() {
  const location = useLocation();
  const { data: networks } = useNetworks();
  const { selectedNetwork, setNetwork } = useNetworkStore();

  return (
    <Shell>
      <Sidebar>
        <Logo>clustec</Logo>
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
          >
            {item.label}
          </NavItem>
        ))}
      </Sidebar>
      <Main>
        <Outlet />
      </Main>
    </Shell>
  );
}
