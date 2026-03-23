import "../index.css";
import { DataProvider } from "@/context/DataContext";
import { AppShell } from "@/AppShell";
import { LayoutModeProvider } from "@/context/LayoutModeContext";

export function App() {
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
