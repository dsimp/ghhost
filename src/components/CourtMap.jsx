"use client";

import React, { useState } from 'react';

const CourtMap = ({ shots = [], activeZone, onZoneClick }) => {
  const [hoverArea, setHoverArea] = useState(null);

  // Approximate overlapping invisible paths for interactive areas that map to NBA's specific string formats
  const zones = [
    {
      id: 'Restricted Area',
      d: "M 40 0 A 40 40 0 0 1 -40 0 L -40 -47.5 L 40 -47.5 Z"
    },
    {
      id: 'In The Paint (Non-RA)',
      d: "M -80 -47.5 L 80 -47.5 L 80 142.5 M 80 142.5 L -80 142.5 L -80 -47.5"
    },
    {
      id: 'Left Corner 3',
      d: "M -250 -47.5 L -220 -47.5 L -220 92.5 L -250 92.5 Z"
    },
    {
      id: 'Right Corner 3',
      d: "M 220 -47.5 L 250 -47.5 L 250 92.5 L 220 92.5 Z"
    },
    {
      id: 'Above the Break 3',
      d: "M -220 92.5 A 237.5 237.5 0 0 0 220 92.5 L 250 92.5 L 250 470 L -250 470 L -250 92.5 Z"
    },
    {
      id: 'Mid-Range',
      d: "M -220 -47.5 L -80 -47.5 L -80 142.5 L 80 142.5 L 80 -47.5 L 220 -47.5 L 220 92.5 A 237.5 237.5 0 0 1 -220 92.5 Z"
    }
  ];

  // Memoize the rendered shots to prevent extreme lag when hovering zones
  const renderedShots = React.useMemo(() => {
    return shots.map((shot, index) => {
       // If a zone is active, fade out shots not in that zone
       if (activeZone && shot.shot_zone_basic !== activeZone) return null;

       const fill = shot.shot_made ? "rgba(34, 197, 94, 0.8)" : "rgba(239, 68, 68, 0.6)";
       const stroke = shot.shot_made ? "#16a34a" : "#dc2626";

       // Use stable keys to prevent React from remounting thousands of elements
       return (
         <circle 
           key={`shot_${shot.game_id || ''}_${shot.id || index}`}
           cx={shot.loc_x}
           cy={shot.loc_y}
           r="4"
           fill={fill}
           stroke={stroke}
           strokeWidth="1"
           className="shot-dot"
         />
       );
    });
  }, [shots, activeZone]);

  return (
    <div className="court-container" style={{ position: 'relative' }}>
      <svg 
        viewBox="-250 -47.5 500 470" 
        className="basketball-court"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Court Background & Lines */}
        <g stroke="rgba(255, 255, 255, 0.4)" fill="none" strokeWidth="2">
          <rect x="-250" y="-47.5" width="500" height="470" />
          <rect x="-80" y="-47.5" width="160" height="190" fill="rgba(30, 41, 59, 0.4)" />
          <rect x="-60" y="-47.5" width="120" height="190" />
          
          {/* Free Throw Circle */}
          <path d="M 60 142.5 A 60 60 0 0 0 -60 142.5" />
          <path d="M 60 142.5 A 60 60 0 0 1 -60 142.5" strokeDasharray="5,5" />
          
          <path d="M 40 0 A 40 40 0 0 1 -40 0" />
          <line x1="-30" y1="-7.5" x2="30" y2="-7.5" strokeWidth="3" stroke="#fff" />
          <circle cx="0" cy="0" r="7.5" fill="none" stroke="#f97316" strokeWidth="2" />
          <line x1="-220" y1="-47.5" x2="-220" y2="92.5" />
          <line x1="220" y1="-47.5" x2="220" y2="92.5" />
          
          {/* 3PT Line Arch */}
          <path d="M -220 92.5 A 237.5 237.5 0 0 0 220 92.5" />
          
          {/* Half Court Circles */}
          <path d="M 60 422.5 A 60 60 0 0 0 -60 422.5" />
          <path d="M 20 422.5 A 20 20 0 0 0 -20 422.5" />
        </g>

        {/* Interactive Overlays */}
        <g className="interactive-zones">
           {zones.map((z, i) => {
              const isHovered = hoverArea === z.id;
              const isActive = activeZone === z.id;
              
              const fillPattern = isActive ? "rgba(59, 130, 246, 0.3)" : isHovered ? "rgba(255, 255, 255, 0.1)" : "transparent";
              
              let stroke = "transparent";
              if (isActive) stroke = "rgba(59, 130, 246, 0.8)";
              else if (isHovered) stroke = "rgba(255, 255, 255, 0.5)";

              return (
                 <path 
                   key={i} 
                   d={z.d} 
                   style={{
                     fill: fillPattern,
                     stroke: stroke,
                     strokeWidth: isActive ? 3 : 1,
                     cursor: 'pointer',
                     transition: 'all 0.2s ease',
                     pointerEvents: 'all'
                   }}
                   onMouseEnter={() => setHoverArea(z.id)}
                   onMouseLeave={() => setHoverArea(null)}
                   onClick={() => onZoneClick(isActive ? null : z.id)}
                 >
                    <title>{z.id} (Click to Filter)</title>
                 </path>
              )
           })}
        </g>

        {/* Shots Plotted */}
        <g className="shots" style={{ pointerEvents: 'none' }}>
          {renderedShots}
        </g>
      </svg>
    </div>
  );
}

export default CourtMap;
