'use client';
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export default function FieldMap({ hits = [] }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Dimensions
    const width = 400;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // We mapped our backend simulation: X ranges approximately -80 to 80, Y ranges 0 to 110
    // Home plate is at (0, 0)
    const xScale = d3.scaleLinear()
      .domain([-100, 100])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, 120])
      .range([innerHeight, 0]); // SVG Y is flipped

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw Baseball Field Elements

    // Outfield fence (arc from foul pole to foul pole)
    // Left foul pole: angle -45 deg, Right: +45 deg. Distance ~ 100
    const fenceArc = d3.arc()
      .innerRadius(0) // Draw as filled wedge for grass
      .outerRadius(yScale(0) - yScale(100)) // Distance mapped to scale
      .startAngle(-Math.PI / 4)
      .endAngle(Math.PI / 4);

    // Translate to Home Plate
    const homeX = xScale(0);
    const homeY = yScale(0);

    // Grass wedge
    g.append("path")
      .attr("d", fenceArc)
      .attr("transform", `translate(${homeX}, ${homeY})`)
      .attr("fill", "#1e3a29") // Dark grass green
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .style("opacity", 0.8);

    // Infield Dirt (Radius ~ 30)
    const dirtArc = d3.arc()
      .innerRadius(0)
      .outerRadius(yScale(0) - yScale(40))
      .startAngle(-Math.PI / 4)
      .endAngle(Math.PI / 4);

    g.append("path")
      .attr("d", dirtArc)
      .attr("transform", `translate(${homeX}, ${homeY})`)
      .attr("fill", "#6b4c3a") // Dirt brown
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1);

    // Foul Lines
    // Left
    g.append("line")
      .attr("x1", homeX)
      .attr("y1", homeY)
      .attr("x2", xScale(-70.7)) // 100 * sin(-45)
      .attr("y2", yScale(70.7))  // 100 * cos(-45)
      .attr("stroke", "white")
      .attr("stroke-width", 2);

    // Right
    g.append("line")
      .attr("x1", homeX)
      .attr("y1", homeY)
      .attr("x2", xScale(70.7))
      .attr("y2", yScale(70.7))
      .attr("stroke", "white")
      .attr("stroke-width", 2);

    // Bases (Diamond shape)
    const baseDistance = 20; // Simulated scale
    // 1st base (+X, +Y)
    g.append("rect")
      .attr("x", xScale(baseDistance * Math.sin(Math.PI/4)) - 4)
      .attr("y", yScale(baseDistance * Math.cos(Math.PI/4)) - 4)
      .attr("width", 8)
      .attr("height", 8)
      .attr("transform", `rotate(45, ${xScale(baseDistance * Math.sin(Math.PI/4))}, ${yScale(baseDistance * Math.cos(Math.PI/4))})`)
      .attr("fill", "white");

    // 2nd base
    g.append("rect")
      .attr("x", xScale(0) - 4)
      .attr("y", yScale(baseDistance * 2) - 4)
      .attr("width", 8)
      .attr("height", 8)
      .attr("transform", `rotate(45, ${xScale(0)}, ${yScale(baseDistance * 2)})`)
      .attr("fill", "white");

    // 3rd base
    g.append("rect")
      .attr("x", xScale(-baseDistance * Math.sin(Math.PI/4)) - 4)
      .attr("y", yScale(baseDistance * Math.cos(Math.PI/4)) - 4)
      .attr("width", 8)
      .attr("height", 8)
      .attr("transform", `rotate(45, ${xScale(-baseDistance * Math.sin(Math.PI/4))}, ${yScale(baseDistance * Math.cos(Math.PI/4))})`)
      .attr("fill", "white");

    // Home plate
    g.append("polygon")
      .attr("points", `${homeX},${homeY} ${homeX-4},${homeY-4} ${homeX-4},${homeY-8} ${homeX+4},${homeY-8} ${homeX+4},${homeY-4}`)
      .attr("fill", "white");

    // Pitcher's mound
    g.append("circle")
      .attr("cx", homeX)
      .attr("cy", yScale(baseDistance))
      .attr("r", 10)
      .attr("fill", "#523624");
    g.append("rect")
      .attr("x", homeX - 3)
      .attr("y", yScale(baseDistance) - 1)
      .attr("width", 6)
      .attr("height", 2)
      .attr("fill", "white");

    // Plot Hits
    // We add a glowing effect to the hits to make it look premium
    const defs = svg.append("defs");
    const filter = defs.append("filter")
      .attr("id", "glow");
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "2.5")
      .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode")
      .attr("in", "coloredBlur");
    feMerge.append("feMergeNode")
      .attr("in", "SourceGraphic");

    const hitGroups = g.selectAll(".hit")
      .data(hits)
      .enter()
      .append("g")
      .attr("class", "hit")
      .attr("transform", d => `translate(${xScale(d.x)}, ${yScale(d.y)})`);

    hitGroups.append("circle")
      .attr("r", 0) // Start radius at 0 for animation
      .attr("fill", d => {
        // Color mapping by zone or value
        if (d.zone === 'leftField' || d.zone === 'rightField') return '#ff3366'; // Reddish for pulls/opposites
        if (d.zone === 'centerField') return '#00ffcc'; // Cyan for center
        return '#f9c80e'; // Yellow for gaps
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .style("filter", "url(#glow)")
      .transition()
      .duration(800)
      .delay((d, i) => i * 15) // Staggered animation
      .attr("r", 4);

  }, [hits]);

  return (
    <div className="flex justify-center items-center w-full bg-slate-900/50 rounded-xl p-4 shadow-2xl border border-slate-700/50 backdrop-blur-sm">
      <svg
        ref={svgRef}
        width={400}
        height={400}
        className="max-w-full h-auto drop-shadow-lg"
        viewBox="0 0 400 400"
      />
    </div>
  );
}
