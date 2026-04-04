import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNetworkStore } from "./stores/network";

function RedirectToNetwork() {
  const { selectedNetwork } = useNetworkStore();
  return <Navigate to={`/${selectedNetwork}`} replace />;
}
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Outliers } from "./pages/Outliers";
import { TxDetail } from "./pages/TxDetail";
import { Labels } from "./pages/Labels";
import { MurderBoard } from "./pages/MurderBoard";
import { Admin } from "./pages/Admin";
import { Fees } from "./pages/Fees";
import { Blocks } from "./pages/Blocks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<RedirectToNetwork />} />
            <Route path="/:network" element={<Dashboard />} />
            <Route path="/:network/txs" element={<Transactions />} />
            <Route path="/:network/privacy-sets" element={<Outliers />} />
            <Route path="/:network/tx/:hash" element={<TxDetail />} />
            <Route path="/:network/labels" element={<Labels />} />
            <Route path="/:network/murder-board" element={<MurderBoard />} />
            <Route path="/:network/fees" element={<Fees />} />
            <Route path="/:network/blocks" element={<Blocks />} />
            <Route path="/:network/admin" element={<Admin />} />
            {/* Legacy routes without network prefix */}
            <Route path="/txs" element={<Transactions />} />
            <Route path="/privacy-sets" element={<Outliers />} />
            <Route path="/tx/:hash" element={<TxDetail />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/murder-board" element={<MurderBoard />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/blocks" element={<Blocks />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
