import * as d3 from "d3";
import { useEffect, useMemo, useRef } from "react";
import type { ForecastPoint } from "../types";

type Props = {
  data: ForecastPoint[];

  width?: number;
  height?: number;

  sampleEvery?: number;
  ticksY?: number;
  maxXTicks?: number;

  showTooltip?: boolean;
  showGrid?: boolean;
  showGlow?: boolean;
  showAverageLine?: boolean;
  showMaxLabel?: boolean;

  formatX?: (d: Date) => string;
  formatY?: (v: number) => string;

  onHover?: (p: { point: ForecastPoint; index: number } | null) => void;
};

function cleanData(data: ForecastPoint[]) {
  return (data ?? []).filter(
      (d) =>
          d &&
          d.date instanceof Date &&
          Number.isFinite(d.date.getTime()) &&
          Number.isFinite(d.wind) &&
          Number.isFinite(d.dt)
  );
}

function mean(vals: number[]) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function defaultFormatTick(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo} ${hh}:00`;
}

function defaultFormatWind(v: number) {
  return `${v.toFixed(1)} m/s`;
}

export function WindChart({
                            data,
                            width = 980,
                            height = 320,
                            sampleEvery = 2,
                            ticksY = 5,
                            maxXTicks = 8,
                            showTooltip = true,
                            showGrid = true,
                            showGlow = true,
                            showAverageLine = false,
                            showMaxLabel = true,
                            formatX = defaultFormatTick,
                            formatY = defaultFormatWind,
                            onHover,
                          }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  const sample = useMemo(() => {
    const safe = cleanData(data);
    const step = Math.max(1, Math.floor(sampleEvery));
    return safe.filter((_, i) => i % step === 0);
  }, [data, sampleEvery]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const svg = d3.select<SVGSVGElement, unknown>(el);
    svg.selectAll("*").remove();

    const margin = { top: 16, right: 18, bottom: 54, left: 62 };

    svg
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "none")
        .style("width", "100%")
        .style("height", "100%")
        .style("display", "block");

    if (!sample || sample.length < 2) {
      svg
          .append("text")
          .attr("x", margin.left)
          .attr("y", margin.top + 16)
          .attr("fill", "rgba(255,255,255,0.80)")
          .attr("font-size", 14)
          .attr("font-weight", 800)
          .text("No data yet");
      onHover?.(null);
      return;
    }

    const axisColor = "rgba(255,255,255,0.34)";
    const tickColor = "rgba(255,255,255,0.92)";
    const gridColor = "rgba(255,255,255,0.07)";

    const x = d3
        .scaleBand<string>()
        .domain(sample.map((d) => String(d.dt)))
        .range([margin.left, width - margin.right])
        .padding(0.28);

    const yMax = d3.max(sample, (d) => d.wind) ?? 1;
    const y = d3
        .scaleLinear()
        .domain([0, Math.max(1, yMax) * 1.25])
        .nice()
        .range([height - margin.bottom, margin.top]);

    if (showGrid) {
      const yGrid = d3
          .axisLeft(y)
          .ticks(ticksY)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat(() => "");

      svg
          .append("g")
          .attr("transform", `translate(${margin.left},0)`)
          .call(yGrid)
          .call((g) => g.select(".domain").remove())
          .call((g) => g.selectAll("line").attr("stroke", gridColor));
    }

    svg
        .append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(ticksY).tickSizeOuter(0))
        .call((g) => g.selectAll("path,line").attr("stroke", axisColor))
        .call((g) => g.selectAll("text").attr("fill", tickColor).attr("font-size", 13).attr("font-weight", 900));

    const tickEvery = Math.max(1, Math.round(sample.length / Math.max(2, maxXTicks)));
    const tickValues = sample.filter((_, i) => i % tickEvery === 0).map((d) => String(d.dt));

    const byKey = new Map<string, ForecastPoint>();
    for (const p of sample) byKey.set(String(p.dt), p);

    const formatTick = (d: d3.AxisDomain) => {
      const p = byKey.get(String(d));
      return p ? formatX(p.date) : "";
    };

    svg
        .append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues(tickValues).tickFormat(formatTick).tickSizeOuter(0))
        .call((g) => g.selectAll("path,line").attr("stroke", axisColor))
        .call((g) =>
            g
                .selectAll("text")
                .attr("fill", tickColor)
                .attr("font-size", 13)
                .attr("font-weight", 900)
                .attr("text-anchor", "end")
                .attr("transform", "rotate(-18)")
                .attr("dx", "-0.3em")
                .attr("dy", "0.7em")
        );

    const bars = svg
        .append("g")
        .selectAll("rect.bar")
        .data(sample)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", (d) => x(String(d.dt)) ?? 0)
        .attr("y", (d) => y(d.wind))
        .attr("width", x.bandwidth())
        .attr("height", (d) => y(0) - y(d.wind))
        .attr("rx", 9)
        .attr("fill", "rgba(37,243,225,0.22)");

    if (showGlow) {
      svg
          .append("g")
          .selectAll("rect.glow")
          .data(sample)
          .enter()
          .append("rect")
          .attr("class", "glow")
          .attr("x", (d) => x(String(d.dt)) ?? 0)
          .attr("y", (d) => y(d.wind))
          .attr("width", x.bandwidth())
          .attr("height", (d) => y(0) - y(d.wind))
          .attr("rx", 9)
          .attr("fill", "rgba(37,243,225,0.16)")
          .attr("filter", "blur(1.6px)");
    }

    const winds = sample.map((d) => d.wind);
    const avg = mean(winds);

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
          .attr("font-weight", 900)
          .text(`avg ${formatY(avg)}`);
    }

    if (showMaxLabel) {
      const maxPoint = d3.greatest(sample, (a, b) => a.wind - b.wind) ?? sample[0];
      const cx = (x(String(maxPoint.dt)) ?? 0) + x.bandwidth() / 2;
      const cy = y(maxPoint.wind);

      svg
          .append("text")
          .attr("x", cx)
          .attr("y", Math.max(margin.top + 10, cy - 10))
          .attr("text-anchor", "middle")
          .attr("fill", "rgba(255,255,255,0.86)")
          .attr("font-size", 12)
          .attr("font-weight", 950)
          .text(`max ${formatY(maxPoint.wind)}`);
    }

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
    const focusBar = focus
        .append("rect")
        .attr("rx", 10)
        .attr("fill", "rgba(255,255,255,0.06)")
        .attr("stroke", "rgba(255,255,255,0.12)");

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
    const ttText = tooltip
        .append("text")
        .attr("fill", "rgba(255,255,255,0.94)")
        .attr("font-size", 13)
        .attr("font-weight", 900);

    function pick(mx: number) {
      const keys = x.domain();
      if (!keys.length) return null;

      const px = Math.max(margin.left, Math.min(width - margin.right, mx));
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;

      for (let i = 0; i < keys.length; i++) {
        const left = x(keys[i]);
        if (left == null) continue;
        const center = left + x.bandwidth() / 2;
        const dist = Math.abs(center - px);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      return { idx: bestIdx, p: sample[bestIdx] };
    }

    function move(mx: number) {
      const picked = pick(mx);
      if (!picked) return;

      const { idx, p } = picked;
      const left = x(String(p.dt));
      if (left == null) return;

      onHover?.({ point: p, index: idx });

      if (!showTooltip) return;

      const cx = left + x.bandwidth() / 2;
      const cy = y(p.wind);

      focus.style("display", null);
      tooltip.style("display", null);

      focusBar
          .attr("x", left - 3)
          .attr("y", margin.top)
          .attr("width", x.bandwidth() + 6)
          .attr("height", height - margin.top - margin.bottom);

      focusDot.attr("cx", cx).attr("cy", cy);

      ttText.selectAll("*").remove();
      ttText.append("tspan").attr("x", 0).attr("dy", "1.15em").text(formatX(p.date));
      ttText.append("tspan").attr("x", 0).attr("dy", "1.35em").text(formatY(p.wind));

      const bb = (ttText.node() as SVGTextElement | null)?.getBBox();
      if (!bb) return;

      const pad2 = 12;
      ttBg.attr("width", bb.width + pad2 * 2).attr("height", bb.height + pad2 * 2);

      const placeLeft = cx > width - margin.right - (bb.width + pad2 * 2) - 24;
      const tx = placeLeft ? cx - (bb.width + pad2 * 2) - 12 : cx + 12;
      const ty = Math.max(
          margin.top,
          Math.min(cy - (bb.height + pad2 * 2) / 2, height - margin.bottom - (bb.height + pad2 * 2))
      );

      tooltip.attr("transform", `translate(${tx},${ty})`);
      ttText.attr("transform", `translate(${pad2},${pad2 - 8})`);

      bars.attr("opacity", (_, i) => (i === idx ? 1 : 0.55));
    }

    function resetHover() {
      focus.style("display", "none");
      tooltip.style("display", "none");
      bars.attr("opacity", 1);
      onHover?.(null);
    }

    if (showTooltip) {
      overlay
          .on("pointerenter", () => {
            focus.style("display", null);
            tooltip.style("display", null);
          })
          .on("pointerleave", () => resetHover())
          .on("pointermove", (event: PointerEvent) => {
            const node = overlay.node();
            if (!node) return;
            const [mx] = d3.pointer(event, node);
            move(mx + margin.left);
          });

      move(margin.left + 1);
    } else {
      overlay.on("pointerleave", () => onHover?.(null));
    }
  }, [
    sample,
    width,
    height,
    sampleEvery,
    ticksY,
    maxXTicks,
    showTooltip,
    showGrid,
    showGlow,
    showAverageLine,
    showMaxLabel,
    formatX,
    formatY,
    onHover,
  ]);

  return <svg ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}
