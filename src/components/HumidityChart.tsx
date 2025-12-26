import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import type { ForecastPoint } from "../types";

type Props = {
  data: ForecastPoint[];
  height?: number;

  showTooltip?: boolean;

  showAverageLine?: boolean;
  showMedianLine?: boolean;
  showMinMax?: boolean;

  showBand?: boolean;
  bandWindow?: number;

  showDayNight?: boolean;
  nightStartHour?: number;
  nightEndHour?: number;

  clampDomain?: boolean;
  ticksX?: number;
  ticksY?: number;

  onHover?: (p: { point: ForecastPoint; index: number } | null) => void;
};

function mean(vals: number[]) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function median(vals: number[]) {
  if (!vals.length) return 0;
  const a = [...vals].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 0) return (a[mid - 1] + a[mid]) / 2;
  return a[mid];
}

function formatTime(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo} ${hh}:${mm}`;
}

function fmtHum(v: number) {
  return `${Math.round(v)}%`;
}

function cleanData(data: ForecastPoint[]) {
  return (data ?? []).filter(
      (d) => d && Number.isFinite(d.humidity) && d.date instanceof Date && Number.isFinite(d.date.getTime())
  );
}

function startOfDay(d: Date) {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

function clampDate(d: Date, min: Date, max: Date) {
  const t = d.getTime();
  if (t < min.getTime()) return new Date(min.getTime());
  if (t > max.getTime()) return new Date(max.getTime());
  return d;
}

function nightIntervals(x0: Date, x1: Date, nightStartHour: number, nightEndHour: number) {
  const out: Array<{ a: Date; b: Date }> = [];
  const start = startOfDay(x0);
  const end = new Date(x1.getTime());

  const ns = Math.max(0, Math.min(23, Math.floor(nightStartHour)));
  const ne = Math.max(0, Math.min(23, Math.floor(nightEndHour)));

  for (let d = new Date(start.getTime()); d.getTime() <= end.getTime() + 24 * 3600_000; ) {
    const day = new Date(d.getTime());
    const next = new Date(d.getTime() + 24 * 3600_000);

    const a = new Date(day.getTime());
    a.setHours(ns, 0, 0, 0);

    const b = new Date(day.getTime());
    b.setHours(ne, 0, 0, 0);

    if (ns === ne) {
      d = next;
      continue;
    }

    if (ns < ne) {
      out.push({ a, b });
    } else {
      const b2 = new Date(next.getTime());
      b2.setHours(ne, 0, 0, 0);
      out.push({ a, b: b2 });
    }

    d = next;
  }

  return out
      .map((x) => ({ a: clampDate(x.a, x0, x1), b: clampDate(x.b, x0, x1) }))
      .filter((x) => x.b.getTime() > x.a.getTime());
}

type BandPoint = { date: Date; min: number; max: number };

function buildRollingBand(points: ForecastPoint[], win: number): BandPoint[] {
  const n = points.length;
  const w = Math.max(1, Math.floor(win));
  const half = Math.floor(w / 2);

  const out: BandPoint[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let mn = Number.POSITIVE_INFINITY;
    let mx = Number.NEGATIVE_INFINITY;
    for (let k = lo; k <= hi; k++) {
      const v = points[k].humidity;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
      mn = points[i].humidity;
      mx = points[i].humidity;
    }
    out.push({ date: points[i].date, min: mn, max: mx });
  }
  return out;
}

export function HumidityChart({
                                data,
                                height = 280,
                                showTooltip = true,
                                showAverageLine = true,
                                showMedianLine = false,
                                showMinMax = true,
                                showBand = false,
                                bandWindow = 3,
                                showDayNight = false,
                                nightStartHour = 18,
                                nightEndHour = 6,
                                clampDomain = true,
                                ticksX = 6,
                                ticksY = 5,
                                onHover,
                              }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  const safe = useMemo(() => cleanData(data), [data]);
  const band = useMemo(() => (safe.length >= 2 ? buildRollingBand(safe, bandWindow) : []), [safe, bandWindow]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const svg = d3.select<SVGSVGElement, unknown>(el);
    svg.selectAll("*").remove();

    const width = 940;
    const margin = { top: 16, right: 18, bottom: 40, left: 56 };

    svg
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "none")
        .style("width", "100%")
        .style("height", "100%")
        .style("display", "block");

    if (!safe || safe.length < 2) {
      svg
          .append("text")
          .attr("x", margin.left)
          .attr("y", margin.top + 16)
          .attr("fill", "rgba(255,255,255,0.78)")
          .attr("font-size", 14)
          .attr("font-weight", 800)
          .text("No data yet");
      onHover?.(null);
      return;
    }

    const xExt = d3.extent(safe, (d) => d.date);
    const x0 = xExt[0];
    const x1 = xExt[1];
    if (!(x0 instanceof Date) || !(x1 instanceof Date)) {
      onHover?.(null);
      return;
    }

    const humExtent = d3.extent(safe, (d) => d.humidity);
    const h0 = humExtent[0];
    const h1 = humExtent[1];

    const yMinRaw = Number.isFinite(h0) ? (h0 as number) : 0;
    const yMaxRaw = Number.isFinite(h1) ? (h1 as number) : 100;

    const yMin = clampDomain ? 0 : Math.max(0, yMinRaw - 6);
    const yMax = clampDomain ? 100 : Math.min(100, yMaxRaw + 6);

    const x = d3.scaleTime().domain([x0, x1]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([height - margin.bottom, margin.top]);

    const axisColor = "rgba(255,255,255,0.34)";
    const tickColor = "rgba(255,255,255,0.92)";
    const gridColor = "rgba(255,255,255,0.06)";

    const plotH = height - margin.top - margin.bottom;

    if (showDayNight) {
      const intervals = nightIntervals(x0, x1, nightStartHour, nightEndHour);
      const gNight = svg.append("g");
      for (const it of intervals) {
        gNight
            .append("rect")
            .attr("x", x(it.a))
            .attr("y", margin.top)
            .attr("width", Math.max(0, x(it.b) - x(it.a)))
            .attr("height", plotH)
            .attr("fill", "rgba(255,255,255,0.03)");
      }
    }

    const yGrid = d3
        .axisLeft<number>(y)
        .ticks(ticksY)
        .tickSize(-(width - margin.left - margin.right))
        .tickFormat(() => "");

    svg
        .append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(yGrid)
        .call((g) => g.select(".domain").remove())
        .call((g) => g.selectAll("line").attr("stroke", gridColor));

    svg
        .append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom<Date>(x).ticks(ticksX).tickSizeOuter(0))
        .call((g) => g.selectAll("path,line").attr("stroke", axisColor))
        .call((g) => g.selectAll("text").attr("fill", tickColor).attr("font-size", 13).attr("font-weight", 800));

    svg
        .append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft<number>(y).ticks(ticksY).tickSizeOuter(0))
        .call((g) => g.selectAll("path,line").attr("stroke", axisColor))
        .call((g) => g.selectAll("text").attr("fill", tickColor).attr("font-size", 13).attr("font-weight", 800));

    const curve = d3.curveMonotoneX;

    if (showBand && band.length === safe.length) {
      const bandArea = d3
          .area<BandPoint>()
          .x((d) => x(d.date))
          .y0((d) => y(d.min))
          .y1((d) => y(d.max))
          .curve(curve);

      const bandTop = d3
          .line<BandPoint>()
          .x((d) => x(d.date))
          .y((d) => y(d.max))
          .curve(curve);

      const bandBottom = d3
          .line<BandPoint>()
          .x((d) => x(d.date))
          .y((d) => y(d.min))
          .curve(curve);

      svg.append("path").datum(band).attr("d", bandArea).attr("fill", "rgba(37,243,225,0.05)");
      svg.append("path").datum(band).attr("d", bandTop).attr("fill", "none").attr("stroke", "rgba(37,243,225,0.20)").attr("stroke-width", 1.3);
      svg.append("path").datum(band).attr("d", bandBottom).attr("fill", "none").attr("stroke", "rgba(37,243,225,0.20)").attr("stroke-width", 1.3);
    }

    const area = d3
        .area<ForecastPoint>()
        .x((d) => x(d.date))
        .y0(height - margin.bottom)
        .y1((d) => y(d.humidity))
        .curve(curve);

    const line = d3
        .line<ForecastPoint>()
        .x((d) => x(d.date))
        .y((d) => y(d.humidity))
        .curve(curve);

    svg.append("path").datum(safe).attr("d", area).attr("fill", "rgba(37,243,225,0.08)");

    svg
        .append("path")
        .datum(safe)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", "rgba(37,243,225,0.25)")
        .attr("stroke-width", 7)
        .attr("filter", "blur(2px)");

    svg.append("path").datum(safe).attr("d", line).attr("fill", "none").attr("stroke", "rgba(37,243,225,0.96)").attr("stroke-width", 2.7);

    const humValues = safe.map((d) => d.humidity);
    const avg = mean(humValues);
    const med = median(humValues);

    if (showAverageLine) {
      svg
          .append("line")
          .attr("x1", margin.left)
          .attr("x2", width - margin.right)
          .attr("y1", y(avg))
          .attr("y2", y(avg))
          .attr("stroke", "rgba(255,255,255,0.18)")
          .attr("stroke-dasharray", "4,6");

      svg
          .append("text")
          .attr("x", width - margin.right)
          .attr("y", y(avg) - 8)
          .attr("text-anchor", "end")
          .attr("fill", "rgba(255,255,255,0.72)")
          .attr("font-size", 12)
          .attr("font-weight", 800)
          .text(`avg ${fmtHum(avg)}`);
    }

    if (showMedianLine) {
      svg
          .append("line")
          .attr("x1", margin.left)
          .attr("x2", width - margin.right)
          .attr("y1", y(med))
          .attr("y2", y(med))
          .attr("stroke", "rgba(255,255,255,0.18)")
          .attr("stroke-dasharray", "2,6");

      svg
          .append("text")
          .attr("x", width - margin.right)
          .attr("y", y(med) - 8)
          .attr("text-anchor", "end")
          .attr("fill", "rgba(255,255,255,0.72)")
          .attr("font-size", 12)
          .attr("font-weight", 800)
          .text(`med ${fmtHum(med)}`);
    }

    if (showMinMax) {
      const minPoint = d3.least(safe, (a, b) => a.humidity - b.humidity) ?? safe[0];
      const maxPoint = d3.greatest(safe, (a, b) => a.humidity - b.humidity) ?? safe[safe.length - 1];

      const marks = [
        { p: minPoint, label: `min ${fmtHum(minPoint.humidity)}` },
        { p: maxPoint, label: `max ${fmtHum(maxPoint.humidity)}` },
      ] as const;

      const g = svg.append("g");

      for (const m of marks) {
        const cx = x(m.p.date);
        const cy = y(m.p.humidity);

        g.append("circle")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 4.5)
            .attr("fill", "rgba(37,243,225,0.98)")
            .attr("stroke", "rgba(37,243,225,0.22)")
            .attr("stroke-width", 8)
            .attr("filter", "blur(0.2px)");

        const placeLeft = cx > width - margin.right - 150;
        const tx = placeLeft ? cx - 10 : cx + 10;
        const anchor = placeLeft ? "end" : "start";

        g.append("text")
            .attr("x", tx)
            .attr("y", cy - 10)
            .attr("text-anchor", anchor)
            .attr("fill", "rgba(255,255,255,0.85)")
            .attr("font-size", 12)
            .attr("font-weight", 900)
            .text(m.label);
      }
    }

    const bisect = d3.bisector<ForecastPoint, Date>((d) => d.date).center;

    const overlay = svg
        .append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "transparent")
        .style("cursor", showTooltip ? "crosshair" : "default")
        .style("touch-action", "none");

    const focus = svg.append("g").style("display", "none");

    const focusLine = focus
        .append("line")
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "rgba(255,255,255,0.20)")
        .attr("stroke-dasharray", "3,6");

    const focusDot = focus
        .append("circle")
        .attr("r", 4.5)
        .attr("fill", "rgba(37,243,225,0.98)")
        .attr("stroke", "rgba(37,243,225,0.30)")
        .attr("stroke-width", 8)
        .attr("filter", "blur(0.2px)");

    const tooltip = svg.append("g").style("display", "none").attr("pointer-events", "none");

    const ttBg = tooltip
        .append("rect")
        .attr("rx", 12)
        .attr("ry", 12)
        .attr("fill", "rgba(10,14,22,0.92)")
        .attr("stroke", "rgba(37,243,225,0.20)");

    const ttText = tooltip.append("text").attr("fill", "rgba(255,255,255,0.94)").attr("font-size", 13).attr("font-weight", 900);

    function move(mx: number) {
      const xDate = x.invert(mx);
      const idx = bisect(safe, xDate);
      const i = Math.max(0, Math.min(safe.length - 1, idx));
      const p = safe[i];

      const cx = x(p.date);
      const cy = y(p.humidity);

      onHover?.({ point: p, index: i });

      if (!showTooltip) return;

      focus.style("display", null);
      tooltip.style("display", null);

      focusLine.attr("x1", cx).attr("x2", cx);
      focusDot.attr("cx", cx).attr("cy", cy);

      ttText.selectAll("*").remove();
      ttText.append("tspan").attr("x", 0).attr("dy", "1.15em").text(formatTime(p.date));
      ttText.append("tspan").attr("x", 0).attr("dy", "1.35em").text(`Humidity ${fmtHum(p.humidity)}`);

      if (showBand && band.length === safe.length) {
        const bp = band[i];
        if (bp && Number.isFinite(bp.min) && Number.isFinite(bp.max)) {
          ttText.append("tspan").attr("x", 0).attr("dy", "1.25em").text(`range ${fmtHum(bp.min)}–${fmtHum(bp.max)}`);
        }
      }

      if (showMedianLine) {
        ttText.append("tspan").attr("x", 0).attr("dy", "1.25em").text(`med ${fmtHum(med)}`);
      }

      const bb = (ttText.node() as SVGTextElement | null)?.getBBox();
      if (!bb) return;

      const pad = 12;
      ttBg.attr("width", bb.width + pad * 2).attr("height", bb.height + pad * 2);

      const placeLeft = cx > width - margin.right - (bb.width + pad * 2) - 24;
      const tx = placeLeft ? cx - (bb.width + pad * 2) - 12 : cx + 12;
      const ty = Math.max(
          margin.top,
          Math.min(cy - (bb.height + pad * 2) / 2, height - margin.bottom - (bb.height + pad * 2))
      );

      tooltip.attr("transform", `translate(${tx},${ty})`);
      ttText.attr("transform", `translate(${pad},${pad - 8})`);
    }

    if (showTooltip) {
      overlay
          .on("pointerenter", () => {
            focus.style("display", null);
            tooltip.style("display", null);
          })
          .on("pointerleave", () => {
            focus.style("display", "none");
            tooltip.style("display", "none");
            onHover?.(null);
          })
          .on("pointermove", (event: PointerEvent) => {
            const node = overlay.node();
            if (!node) return;
            const [mx] = d3.pointer(event, node);
            move(mx);
          });

      move(margin.left + 1);
    } else {
      overlay.on("pointerleave", () => onHover?.(null));
    }
  }, [
    safe,
    band,
    height,
    showTooltip,
    showAverageLine,
    showMedianLine,
    showMinMax,
    showBand,
    showDayNight,
    nightStartHour,
    nightEndHour,
    clampDomain,
    ticksX,
    ticksY,
    onHover,
  ]);

  return <svg ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
