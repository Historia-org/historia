import HistoriaMap from "./map/HistoriaMap";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>HISTORIA</h1>
        <span>cartographie historique collaborative — phase 0</span>
      </header>
      <HistoriaMap />
    </div>
  );
}
