import "../index.css";
import { DataProvider } from "@/context/DataContext";
import { AppShell } from "@/AppShell";

export function App() {
  return (
    <div className="w-screen h-screen overflow-hidden min-w-48 bg-sig-bg font-mono">
      <DataProvider>
        <AppShell />
      </DataProvider>
    </div>
  );
}

export default App;
