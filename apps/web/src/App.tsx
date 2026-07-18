import { useEffect, useMemo, useState } from "react";
import type { EventDetail } from "@historia/shared";
import HistoriaMap from "./map/HistoriaMap";
import Timeline from "./timeline/Timeline";

/** Pilot event (Phase 1: single hard-coded event page). */
const EVENT_SLUG = "commune-de-paris-1871";

export default function App() {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/events/${EVENT_SLUG}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then((ev: EventDetail) => {
        setEvent(ev);
        // Start on the most eventful day available (last breakpoint = Bloody Week)
        setDate(ev.breakpoints.at(-1) ?? ev.period_start ?? "1871-05-21");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // The cursor moves day by day, but between two breakpoints the map is
  // identical — so tiles are requested at the previous breakpoint's date and
  // HTTP caching collapses 72 days into ~a dozen distinct URLs.
  const tileDate = useMemo(() => {
    if (!event || !date) return date;
    const prev = event.breakpoints.filter((b) => b <= date).at(-1);
    return prev ?? date;
  }, [event, date]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>HISTORIA</h1>
        <span>{event ? event.title : "collaborative historical mapping"}</span>
        {event && (
          <span className="app-header-period">
            {event.period_start} → {event.period_end} ·{" "}
            {event.feature_count} features
          </span>
        )}
        {error && <span className="app-header-error">API unreachable ({error})</span>}
      </header>

      <main className="app-main">
        {tileDate && <HistoriaMap date={tileDate} />}
        {event?.description_md && (
          <aside className="event-panel">
            <h2>{event.title}</h2>
            <p>{event.description_md}</p>
            <p className="event-panel-hint">
              Drag the timeline — barricades and front lines appear and
              disappear at their sourced dates. Shift+←/→ jumps between
              breakpoints, Space plays.
            </p>
          </aside>
        )}
      </main>

      {event && date && event.period_start && event.period_end && (
        <Timeline
          start={event.period_start}
          end={event.period_end}
          breakpoints={event.breakpoints}
          value={date}
          onChange={setDate}
        />
      )}
    </div>
  );
}
