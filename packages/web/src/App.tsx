import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Outliers } from "./pages/Outliers";

import { TxDetail } from "./pages/TxDetail";
import { Labels } from "./pages/Labels";
import { MyTransactions } from "./pages/MyTransactions";

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
            <Route path="/privacy-sets" element={<Outliers />} />
            <Route path="/tx/:hash" element={<TxDetail />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/my-txs" element={<MyTransactions />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
