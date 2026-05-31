import { FundDetailPage } from "./pages/FundDetailPage";
import { FundsPage } from "./pages/FundsPage";
import { IncomesPage } from "./pages/IncomesPage";
import { useEffect, useState } from "react";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    function handleLocationChange() {
      setPath(window.location.pathname);
    }

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("funds:navigate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("funds:navigate", handleLocationChange);
    };
  }, []);

  if (path.startsWith("/fund-detail")) {
    return <FundDetailPage />;
  }

  if (path.startsWith("/incomes")) {
    return <IncomesPage />;
  }

  return <FundsPage />;
}
