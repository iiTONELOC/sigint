import "../index.css";
import { useEffect } from "react";
import { DataProvider } from "@/context/DataContext";
import { AppShell } from "@/AppShell";
import { LayoutModeProvider } from "@/layout-mode";
import { hydratePreferences } from "@/preferences";

export function App() {
  useEffect(() => {
    hydratePreferences();
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden min-w-48 bg-sig-bg font-mono">
      <LayoutModeProvider>
        <DataProvider>
          <AppShell />
        </DataProvider>
      </LayoutModeProvider>
    </div>
  );
}

export default App;
