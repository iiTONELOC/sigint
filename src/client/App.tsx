import "../index.css";
import { LiveTrafficPane } from "@/panes/live-traffic/LiveTrafficPane";

export function App() {
  return (
    <div className="w-screen h-screen overflow-hidden min-w-[320px] bg-sig-bg font-mono">
      <LiveTrafficPane />
    </div>
  );
}

export default App;
