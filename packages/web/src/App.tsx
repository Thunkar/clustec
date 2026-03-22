import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Outliers } from "./pages/Outliers";
import { TxDetail } from "./pages/TxDetail";
import { Labels } from "./pages/Labels";
import { MurderBoard } from "./pages/MurderBoard";
import { Admin } from "./pages/Admin";
import { Fees } from "./pages/Fees";

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
            <Route path="/" element={<Dashboard />} />
            <Route path="/txs" element={<Transactions />} />
            <Route path="/privacy-sets" element={<Outliers />} />
            <Route path="/tx/:hash" element={<TxDetail />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/murder-board" element={<MurderBoard />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
