"use client";

import React from 'react';

/**
 * GhostLogo — Custom SVG ghost icon for the Ghhost brand.
 * 
 * A minimal, slightly rebellious ghost silhouette with an ethereal glow.
 * Not cute, not Halloween — mysterious and sharp. Designed for adults.
 *
 * @param {number} size - Icon size in pixels (default: 32)
 * @param {string} glowColor - Glow color (default: '#00d4aa')
 * @param {boolean} animate - Enable floating + glow animation (default: true)
 * @param {object} style - Additional inline styles
 */
export default function GhostLogo({ size = 32, glowColor = '#00d4aa', animate = true, style = {} }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: `drop-shadow(0 0 8px ${glowColor}40)`,
        animation: animate ? 'float 4s ease-in-out infinite, haunt 3s ease-in-out infinite' : 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 64 80"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer glow layer */}
        <defs>
          <radialGradient id={`ghostGlow-${size}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={glowColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`ghostBody-${size}`} x1="32" y1="0" x2="32" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e8ecf4" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#e8ecf4" stopOpacity="0.7" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Ambient glow behind ghost */}
        <ellipse cx="32" cy="36" rx="26" ry="30" fill={`url(#ghostGlow-${size})`} />

        {/* Ghost body — sharp, angular silhouette with tattered bottom */}
        <path
          d="M32 4
             C18 4 8 16 8 30
             L8 60
             C8 62 10 64 12 62
             L16 56
             C18 54 20 54 22 56
             L26 62
             C28 64 30 64 32 62
             L36 56
             C38 54 40 54 42 56
             L48 62
             C50 64 52 64 54 62
             L56 56
             L56 30
             C56 16 46 4 32 4Z"
          fill={`url(#ghostBody-${size})`}
          stroke={glowColor}
          strokeWidth="0.5"
          strokeOpacity="0.3"
        />

        {/* Left eye — narrow, sharp slit */}
        <ellipse cx="22" cy="30" rx="3.5" ry="5" fill="#06080f" opacity="0.9" />
        <ellipse cx="22" cy="29" rx="1.5" ry="2" fill={glowColor} opacity="0.6" />

        {/* Right eye — narrow, sharp slit */}
        <ellipse cx="42" cy="30" rx="3.5" ry="5" fill="#06080f" opacity="0.9" />
        <ellipse cx="42" cy="29" rx="1.5" ry="2" fill={glowColor} opacity="0.6" />


      </svg>
    </div>
  );
}
