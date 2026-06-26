'use client';
import React, { useState } from 'react';

const statData = {
  NBA: [
    ['PTS', 'Points'],
    ['REB', 'Rebounds'],
    ['AST', 'Assists'],
    ['STL', 'Steals'],
    ['BLK', 'Blocks'],
    ['3PM', 'Three-Pointers Made'],
    ['TOV', 'Turnovers'],
    ['PRA', 'Points + Rebounds + Assists (Combo)'],
    ['L10', 'Last 10 Games Average'],
    ['H/A', 'Home/Away Split'],
    ['H2H', 'Head-to-Head vs Opponent'],
    ['USG%', 'Usage Rate'],
    ['TS%', 'True Shooting %'],
  ],
  WNBA: [
    ['PTS', 'Points'],
    ['REB', 'Rebounds'],
    ['AST', 'Assists'],
    ['STL', 'Steals'],
    ['BLK', 'Blocks'],
    ['3PM', 'Three-Pointers Made'],
    ['TOV', 'Turnovers'],
    ['PRA', 'Points + Rebounds + Assists (Combo)'],
    ['L10', 'Last 10 Games Average'],
    ['H/A', 'Home/Away Split'],
    ['H2H', 'Head-to-Head vs Opponent'],
    ['USG%', 'Usage Rate'],
    ['TS%', 'True Shooting %'],
  ],
  MLB: [
    ['H', 'Hits'],
    ['TB', 'Total Bases'],
    ['R', 'Runs'],
    ['RBI', 'Runs Batted In'],
    ['HR', 'Home Runs'],
    ['SB', 'Stolen Bases'],
    ['BB', 'Base on Balls (Walks)'],
    ['K', 'Strikeouts (Pitcher)'],
    ['ER', 'Earned Runs (Pitcher)'],
    ['HA', 'Hits Allowed (Pitcher)'],
    ['IP', 'Innings Pitched'],
    ['ERA', 'Earned Run Average'],
    ['RHP/LHP', 'Right/Left-Handed Pitcher'],
    ['Park Factor', 'Stadium-specific hitting modifier'],
  ],
  NFL: [
    ['PASS YDS', 'Passing Yards'],
    ['RUSH YDS', 'Rushing Yards'],
    ['REC YDS', 'Receiving Yards'],
    ['PASS TDS', 'Passing Touchdowns'],
    ['RUSH TDS', 'Rushing Touchdowns'],
    ['REC TDS', 'Receiving Touchdowns'],
    ['COMP', 'Completions'],
    ['REC', 'Receptions'],
    ['RUSH ATT', 'Rush Attempts'],
    ['INT', 'Interceptions'],
    ['SACKS', 'Quarterback Sacks'],
    ['TACKLES', 'Defensive Tackles'],
  ],
};

const predictionLabels = [
  { label: 'STRONG OVER', desc: 'Very high confidence the player exceeds the target', color: '#22c55e' },
  { label: 'OVER', desc: 'Player favored to exceed the target', color: '#4ade80' },
  { label: 'UNDER', desc: 'Player favored to fall below the target', color: '#f87171' },
  { label: 'STRONG UNDER', desc: 'Very high confidence the player falls below', color: '#ef4444' },
  { label: '🧠 Brain Adj', desc: 'Self-correcting AI adjustment based on past prediction accuracy', color: '#a78bfa' },
  { label: '🔥 Hot', desc: 'Player on a hot streak in this category', color: '#fb923c' },
  { label: '🧊 Cold', desc: 'Player on a cold streak', color: '#7dd3fc' },
  { label: '👻 Ghhost', desc: 'Our proprietary prediction with pinpoint projection', color: '#f472b6' },
  { label: 'Confidence %', desc: 'How confident the engine is (1-99%)', color: 'var(--text-muted)' },
];

export default function StatLegend({ sport = 'NBA' }) {
  const [isOpen, setIsOpen] = useState(false);
  const entries = statData[sport] || statData.NBA;

  return (
    <div style={{ marginBottom: '20px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
          border: '1px solid rgba(139,92,246,0.35)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '10px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.25s ease',
          width: 'auto',
        }}
      >
        📖 Stat Guide
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.3s ease',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          fontSize: '0.7rem',
        }}>▼</span>
      </button>

      <div
        style={{
          maxHeight: isOpen ? '2000px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div
          className="glass-panel"
          style={{
            marginTop: '12px',
            padding: '20px',
            background: 'linear-gradient(135deg, rgba(15,15,25,0.95), rgba(20,20,35,0.9))',
            border: '1px solid transparent',
            borderImage: 'linear-gradient(135deg, rgba(59,130,246,0.4), rgba(139,92,246,0.4), rgba(236,72,153,0.3)) 1',
            borderRadius: '14px',
          }}
        >
          {/* Stat Abbreviations Table */}
          <h4 style={{
            margin: '0 0 14px 0',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            📊 {sport} Stat Abbreviations
          </h4>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '6px',
            marginBottom: '24px',
          }}>
            {entries.map(([abbr, meaning]) => (
              <div
                key={abbr}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  color: 'var(--accent)',
                  minWidth: '70px',
                  flexShrink: 0,
                }}>{abbr}</span>
                <span style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  lineHeight: '1.3',
                }}>{meaning}</span>
              </div>
            ))}
          </div>

          {/* Prediction Labels Section */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '18px',
          }}>
            <h4 style={{
              margin: '0 0 14px 0',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              🏷️ Prediction Labels
            </h4>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '8px',
            }}>
              {predictionLabels.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    color: item.color,
                    minWidth: '110px',
                    flexShrink: 0,
                  }}>{item.label}</span>
                  <span style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    lineHeight: '1.3',
                  }}>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
