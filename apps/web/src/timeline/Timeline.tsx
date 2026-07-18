import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Timeline — the project's signature UX (custom, not a generic slider lib).
 *
 * Day-level cursor over the event period. Breakpoints (dates where the visible
 * map actually changes) are marked on the track; the parent snaps tile
 * requests to them, the cursor itself moves freely day by day.
 */
interface TimelineProps {
  /** ISO dates (YYYY-MM-DD), inclusive period */
  start: string;
  end: string;
  breakpoints: string[];
  value: string;
  onChange: (date: string) => void;
}

const DAY_MS = 86_400_000;

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function Timeline({
  start,
  end,
  breakpoints,
  value,
  onChange,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  const startMs = toMs(start);
  const totalDays = Math.round((toMs(end) - startMs) / DAY_MS);
  const dayIndex = Math.round((toMs(value) - startMs) / DAY_MS);

  const pct = useCallback(
    (iso: string) => ((toMs(iso) - startMs) / DAY_MS / totalDays) * 100,
    [startMs, totalDays]
  );

  const setDay = useCallback(
    (day: number) => {
      const clamped = Math.max(0, Math.min(totalDays, day));
      onChange(toIso(startMs + clamped * DAY_MS));
    },
    [onChange, startMs, totalDays]
  );

  /** First day of each month inside the period, for axis labels. */
  const monthTicks = useMemo(() => {
    const ticks: { iso: string; label: string }[] = [];
    const d = new Date(startMs);
    d.setUTCDate(1);
    for (; d.getTime() <= toMs(end); d.setUTCMonth(d.getUTCMonth() + 1)) {
      if (d.getTime() < startMs) continue;
      ticks.push({
        iso: toIso(d.getTime()),
        label: d.toLocaleDateString("en-GB", {
          month: "short",
          timeZone: "UTC",
        }),
      });
    }
    return ticks;
  }, [startMs, end]);

  // Playback: advance one day at a time (states appear/disappear as they come)
  useEffect(() => {
    if (!playing) return;
    if (dayIndex >= totalDays) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setDay(dayIndex + 1), 450);
    return () => clearTimeout(t);
  }, [playing, dayIndex, totalDays, setDay]);

  const dayFromPointer = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * totalDays);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setPlaying(false);
    (e.target as Element).setPointerCapture(e.pointerId);
    setDay(dayFromPointer(e.clientX));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons & 1) setDay(dayFromPointer(e.clientX));
  };

  const jumpBreakpoint = (dir: -1 | 1) => {
    setPlaying(false);
    const sorted =
      dir === 1 ? breakpoints : [...breakpoints].slice().reverse();
    const next = sorted.find((b) =>
      dir === 1 ? toMs(b) > toMs(value) : toMs(b) < toMs(value)
    );
    if (next) onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight")
      e.shiftKey ? jumpBreakpoint(1) : setDay(dayIndex + 1);
    else if (e.key === "ArrowLeft")
      e.shiftKey ? jumpBreakpoint(-1) : setDay(dayIndex - 1);
    else if (e.key === " ") {
      e.preventDefault();
      setPlaying((p) => !p);
    } else return;
    e.stopPropagation();
  };

  return (
    <div className="timeline" onKeyDown={handleKeyDown}>
      <div className="timeline-controls">
        <button
          type="button"
          title="Previous breakpoint (Shift+←)"
          onClick={() => jumpBreakpoint(-1)}
        >
          ⏮
        </button>
        <button
          type="button"
          title="Play/pause (Space)"
          className="timeline-play"
          onClick={() => {
            if (!playing && dayIndex >= totalDays) setDay(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          title="Next breakpoint (Shift+→)"
          onClick={() => jumpBreakpoint(1)}
        >
          ⏭
        </button>
      </div>

      <div
        className="timeline-track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Historical date"
        aria-valuemin={0}
        aria-valuemax={totalDays}
        aria-valuenow={dayIndex}
        aria-valuetext={formatDay(value)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <div className="timeline-axis" />
        {monthTicks.map((t) => (
          <div
            key={t.iso}
            className="timeline-month"
            style={{ left: `${pct(t.iso)}%` }}
          >
            {t.label}
          </div>
        ))}
        {breakpoints.map((b) => (
          <button
            type="button"
            key={b}
            className={`timeline-breakpoint${b === value ? " active" : ""}`}
            style={{ left: `${pct(b)}%` }}
            title={formatDay(b)}
            tabIndex={-1}
            onPointerDown={(e) => {
              e.stopPropagation();
              setPlaying(false);
              onChange(b);
            }}
          />
        ))}
        <div className="timeline-cursor" style={{ left: `${pct(value)}%` }}>
          <span className="timeline-cursor-label">{formatDay(value)}</span>
        </div>
      </div>
    </div>
  );
}
