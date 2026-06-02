'use client';
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export default function TrendGraph({ logs = [], statKey = '', statLabel = '' }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, data: null });
  const [showRaw, setShowRaw] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || logs.length === 0) return;

    // Reverse logs to be chronological (oldest to newest)
    const data = [...logs].reverse().map((log, i) => {
      // Handle both NBA (lowercase keys like 'pts') and MLB (uppercase keys like 'H', 'HR')
      let val = log[statKey];
      if (val === undefined) {
        val = log[statKey.toLowerCase()];
      }
      if (val === undefined) {
        val = log[statKey.toUpperCase()];
      }

      const rawDate = log.date || log.game_date || log.gameDate;
      let displayDate = 'N/A';
      if (rawDate) {
        try {
          displayDate = new Date(rawDate).toLocaleDateString();
          if (displayDate === 'Invalid Date') displayDate = rawDate;
        } catch (e) {
          displayDate = rawDate;
        }
      }

      return {
        game: i + 1,
        value: Number(val) || 0,
        date: displayDate,
        opponent: log.opponentAbbr || log.opponent || 'N/A',
        isHome: log.isHome !== undefined ? log.isHome : null
      };
    });

    // Dimensions
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = 300;
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // Scales
    const xScale = d3.scaleLinear()
      .domain([1, Math.max(2, data.length)])
      .range([0, innerWidth]);

    const yMax = d3.max(data, d => d.value) || 10;
    const yMin = 0; // Always anchor at 0 for these stats

    const yScale = d3.scaleLinear()
      .domain([yMin, yMax * 1.2]) // Add 20% padding to top
      .range([innerHeight, 0]);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(Math.min(data.length, 10)).tickFormat(d => `G${d}`);
    const yAxis = d3.axisLeft(yScale).ticks(5);

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .attr("color", "var(--text-muted)");

    g.append("g")
      .call(yAxis)
      .attr("color", "var(--text-muted)");

    // Gridlines
    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat("")
      )
      .attr("color", "rgba(255,255,255,0.05)")
      .style("stroke-dasharray", "3,3");

    // Season Average Line
    const avgValue = d3.mean(data, d => d.value);
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(avgValue))
      .attr("y2", yScale(avgValue))
      .attr("stroke", "#8b5cf6")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,5");

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(avgValue) - 5)
      .attr("fill", "#8b5cf6")
      .attr("font-size", "10px")
      .attr("text-anchor", "end")
      .text(`Avg: ${avgValue.toFixed(1)}`);

    // 5-Game Rolling Average
    if (data.length >= 3 && showTrend) {
      const rollingData = [];
      const windowSize = 5;
      for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const windowSlice = data.slice(start, i + 1);
        const rollingAvg = d3.mean(windowSlice, d => d.value);
        rollingData.push({ game: data[i].game, value: rollingAvg });
      }

      const rollingLine = d3.line()
        .x(d => xScale(d.game))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(rollingData)
        .attr("fill", "none")
        .attr("stroke", "#f59e0b") // Orange for trend
        .attr("stroke-width", 2)
        .style("opacity", 0.7)
        .attr("d", rollingLine);
        
      g.append("text")
        .attr("x", innerWidth - 5)
        .attr("y", 10)
        .attr("fill", "#f59e0b")
        .attr("font-size", "10px")
        .attr("text-anchor", "end")
        .text("5-Game Trend");
    }

    // Raw Data Line
    if (showRaw) {
      const line = d3.line()
        .x(d => xScale(d.game))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 3)
        .attr("d", line);

      // Data Points
      g.selectAll(".point")
        .data(data)
        .enter()
        .append("circle")
        .attr("class", "point")
        .attr("cx", d => xScale(d.game))
        .attr("cy", d => yScale(d.value))
        .attr("r", 5)
        .attr("fill", "var(--panel-bg)")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 2)
        .on("mouseover", (event, d) => {
          d3.select(event.currentTarget).attr("r", 8).attr("fill", "var(--accent)");
          const [x, y] = d3.pointer(event, container);
          setTooltip({ show: true, x, y, data: d });
        })
        .on("mouseout", (event) => {
          d3.select(event.currentTarget).attr("r", 5).attr("fill", "var(--panel-bg)");
          setTooltip({ show: false, x: 0, y: 0, data: null });
        });
    }

  }, [logs, statKey, showRaw, showTrend]);

  return (
    <div style={{ width: '100%' }}>
      {/* Toggles */}
      <div style={{ display: 'flex', gap: '15px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
          <div style={{ width: '12px', height: '3px', background: 'var(--accent)' }}></div> Raw Game
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} />
          <div style={{ width: '12px', height: '3px', background: '#f59e0b' }}></div> 5-Game Trend
        </label>
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '300px' }}>
        <svg ref={svgRef} width="100%" height="100%" style={{ overflow: 'visible' }} />
        
        {tooltip.show && tooltip.data && (
          <div style={{
            position: 'absolute',
            left: `${tooltip.x + 15}px`,
            top: `${tooltip.y - 40}px`,
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid var(--accent)',
            padding: '8px 12px',
            borderRadius: '8px',
            pointerEvents: 'none',
            zIndex: 10,
            color: 'white',
            fontSize: '0.8rem',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            minWidth: '120px'
          }}>
            <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px', marginBottom: '4px' }}>
              Game {tooltip.data.game} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', float: 'right' }}>{tooltip.data.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>vs {tooltip.data.opponent} {tooltip.data.isHome !== null ? (tooltip.data.isHome ? '(H)' : '(A)') : ''}</span>
              <strong style={{ color: 'var(--accent)', fontSize: '1.1rem', marginLeft: '10px' }}>{tooltip.data.value}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
