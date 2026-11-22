"use client";

import { useId, useState } from "react";

export interface DailyPoint {
  day: string; // YYYY-MM-DD
  value: number;
}

type Format = "int" | "usd";

export function formatValue(value: number, format: Format): string {
  if (format === "int") return Math.round(value).toLocaleString("en-US");
  if (value === 0) return "$0";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 1) return `$${value.toFixed(3)}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function formatDay(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : dayFormatter.format(d);
}

/** Rounds a max up to a 1/2/5 x 10^n step so gridlines land on clean numbers. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= m * exp) return m * exp;
  return 10 * exp;
}

/** Bar path with 4px rounded top corners, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const W = 640;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 48 };

/**
 * One series per chart (one axis, no legend: the title names the series).
 * Hover or focus a day to see its exact value; the table below has every day.
 */
export function DailyBars({ title, data, format = "int" }: { title: string; data: DailyPoint[]; format?: Format }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = data.length > 0 ? innerW / data.length : innerW;
  const gap = 2;
  const barW = Math.max(1, Math.min(18, slot - gap));
  const ticks = [0, max / 2, max];
  const total = data.reduce((n, d) => n + d.value, 0);
  const labelIdx = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const point = active !== null ? data[active] : null;

  return (
    <figure className="viz-root rounded-[var(--radius)] border border-border bg-card p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">
          Total <span className="font-medium tabular-nums text-foreground">{formatValue(total, format)}</span>
        </span>
      </figcaption>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-labelledby={`${id}-desc`}
          onMouseLeave={() => setActive(null)}
        >
          <desc id={`${id}-desc`}>
            {title}, daily, {data.length} days. Total {formatValue(total, format)}.
          </desc>
          {ticks.map((t) => {
            const y = PAD.top + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-axis)">
                  {formatValue(t, format)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * innerH;
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const y = PAD.top + innerH - h;
            return (
              <g key={d.day}>
                {d.value > 0 && (
                  <path d={barPath(x, y, barW, h)} fill="var(--viz-bar)" opacity={active === null || active === i ? 1 : 0.45} />
                )}
                {labelIdx.has(i) && (
                  <text
                    x={x + barW / 2}
                    y={H - 6}
                    textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                    fontSize={11}
                    fill="var(--viz-axis)"
                  >
                    {formatDay(d.day)}
                  </text>
                )}
                {/* Hit target: the whole column, larger than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatDay(d.day)}: ${formatValue(d.value, format)}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>

        {point && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm shadow-sm"
            style={{ left: `${((PAD.left + active * slot + slot / 2) / W) * 100}%` }}
          >
            <div className="text-muted-foreground">{formatDay(point.day)}</div>
            <div className="font-semibold tabular-nums text-foreground">{formatValue(point.value, format)}</div>
          </div>
        )}
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-medium">Day (UTC)</th>
                <th className="py-1 text-right font-medium">{title}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t border-border">
                  <td className="py-1 pr-4">{formatDay(d.day)}</td>
                  <td className="py-1 text-right">{formatValue(d.value, format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
