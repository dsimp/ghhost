"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Terminal, Send, Sparkles, X, MessageSquare } from 'lucide-react';
import GhostLogo from '@/components/GhostLogo';

/* ═══════════════════════════════════════════════════════════════════
 * GHHOST INSIGHTS — Global Floating Chat Widget
 * 
 * A mysterious, always-available AI chat that rides alongside
 * every page. Detects the current sport context from the URL,
 * loads the relevant prediction data, and lets users ask anything.
 * ═══════════════════════════════════════════════════════════════════ */

export default function GhhostChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextSport, setContextSport] = useState(null);
  const [contextData, setContextData] = useState(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const feedRef = useRef(null);
  const inputRef = useRef(null);

  // Detect sport from current page route
  const detectSport = useCallback(() => {
    if (pathname.startsWith('/nba')) return 'NBA';
    if (pathname.startsWith('/mlb')) return 'MLB';
    if (pathname.startsWith('/wnba')) return 'WNBA';
    if (pathname.startsWith('/nfl')) return 'NFL';
    if (pathname.startsWith('/lab')) return 'LAB';
    return 'ALL';
  }, [pathname]);

  // Load prediction context when chat opens or sport changes
  useEffect(() => {
    if (!isOpen) return;

    const sport = detectSport();
    if (sport === contextSport && contextLoaded) return;

    setContextSport(sport);
    setContextLoaded(false);

    // Fetch predictions for detected sport(s)
    const fetchContext = async () => {
      try {
        const sports = sport === 'ALL' || sport === 'LAB'
          ? ['nba', 'mlb', 'wnba', 'nfl']
          : [sport.toLowerCase()];

        const results = await Promise.all(
          sports.map(s =>
            fetch(`/api/${s}/predictToday`)
              .then(r => r.json())
              .then(data => ({ sport: s.toUpperCase(), ...data }))
              .catch(() => null)
          )
        );

        const validData = results.filter(r => r && r.players && r.players.length > 0);
        setContextData(validData);
        setContextLoaded(true);
      } catch {
        setContextLoaded(true);
        setContextData([]);
      }
    };

    fetchContext();
  }, [isOpen, pathname, detectSport, contextSport, contextLoaded]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Build context for the AI from loaded prediction data
  const buildContext = useCallback(() => {
    if (!contextData || contextData.length === 0) return [];
    
    const allPlayers = [];
    contextData.forEach(sportData => {
      if (!sportData.players) return;
      sportData.players.forEach(p => {
        if (!p.evaluations || p.evaluations.length === 0) return;
        const best = p.evaluations.reduce((a, b) =>
          (b.confidence || 0) > (a.confidence || 0) ? b : a
        );
        allPlayers.push({
          player: p.player,
          team: p.team,
          opponent: p.opponentAbbr || p.opponent,
          sport: sportData.sport,
          isHome: p.isHome,
          prop: best.category,
          call: best.call,
          confidence: best.confidence,
          projected: best.projectedTarget,
          average: best.avg,
          oppRank: best.rank,
          streakInfo: best.streakDesc,
          venueAndRest: best.oppDesc,
          dataLakeNotes: best.memoryDesc,
          allEvals: p.evaluations.map(e => ({
            category: e.category,
            call: e.call,
            projected: e.projectedTarget,
            avg: e.avg,
            confidence: e.confidence,
          })),
        });
      });
    });

    // Sort by confidence, take top 10
    allPlayers.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return allPlayers.slice(0, 10);
  }, [contextData]);

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;

    setInput('');
    const userMsg = { type: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const sport = detectSport();
      const topPlayers = buildContext();

      // Build conversation history for context
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: sport === 'ALL' || sport === 'LAB' ? 'MULTI' : sport,
          players: topPlayers,
          question: q,
          conversationHistory,
          globalMode: true,
          matchups: contextData?.flatMap(d => d.matchups || []) || [],
        }),
      });

      const data = await res.json();
      if (data.insights) {
        const newMsgs = data.insights.map(text => ({ type: 'system', text }));
        setMessages(prev => [...prev, ...newMsgs]);
        if (!isOpen) setHasNewMessage(true);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { type: 'system', text: '👻 Connection disrupted. Try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, detectSport, buildContext, contextData, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  const toggleChat = () => {
    setIsOpen(prev => !prev);
    setHasNewMessage(false);
  };

  // Format bold text
  const formatText = (text) => {
    if (!text) return text;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const sport = detectSport();
  const sportLabel = sport === 'ALL' ? 'All Sports' : sport === 'LAB' ? 'Lab' : sport;

  return (
    <>
      {/* ═══ CHAT PANEL ═══ */}
      <div
        style={{
          position: 'fixed',
          bottom: '136px',
          right: '20px',
          width: 'min(400px, calc(100vw - 40px))',
          height: isOpen ? 'min(520px, calc(100dvh - 200px))' : '0px',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
          transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 60,
          pointerEvents: isOpen ? 'auto' : 'none',
          overflow: 'hidden',
          borderRadius: '16px',
          background: 'linear-gradient(180deg, rgba(6,4,16,0.98), rgba(10,5,20,0.99))',
          border: '1px solid rgba(168,85,247,0.25)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 30px rgba(168,85,247,0.08), inset 0 1px 0 rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Title Bar */}
        <div style={{
          background: 'linear-gradient(90deg, rgba(168,85,247,0.12), rgba(0,212,170,0.05))',
          borderBottom: '1px solid rgba(168,85,247,0.15)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#a855f7',
            letterSpacing: '1px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Terminal size={14} />
            GHHOST INSIGHTS
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 400 }}>v3.0</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontSize: '0.55rem',
              color: 'var(--text-ghost)',
              fontFamily: 'monospace',
              padding: '2px 8px',
              background: 'rgba(168,85,247,0.08)',
              borderRadius: '4px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              {sportLabel}
            </span>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: contextLoaded ? '#22c55e' : '#f59e0b',
              boxShadow: contextLoaded ? '0 0 8px #22c55e' : '0 0 8px #f59e0b',
            }} />
            <button
              onClick={toggleChat}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div
          ref={feedRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 16px',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.75rem',
            lineHeight: '1.7',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {messages.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              gap: '16px',
              flex: 1,
            }}>
              <GhostLogo size={36} glowColor="#a855f7" animate={true} />
              <div>
                <div style={{ color: '#a855f7', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                  Ghhost Insights Online
                </div>
                <div style={{ color: 'rgba(168,85,247,0.5)', fontSize: '0.7rem', lineHeight: '1.8' }}>
                  Ask about any player, matchup, or trend.
                  <br />
                  <span style={{ color: 'rgba(168,85,247,0.35)' }}>
                    "Who has the best edge tonight?"
                    <br />
                    "Is LeBron a good pick for rebounds?"
                    <br />
                    "What does the data say about the Yankees?"
                  </span>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                color: msg.type === 'user' ? '#f59e0b' : '#c4b5fd',
                padding: '8px 12px',
                borderRadius: '8px',
                background: msg.type === 'user' ? 'rgba(245,158,11,0.06)' : 'rgba(168,85,247,0.06)',
                borderLeft: `2px solid ${msg.type === 'user' ? '#f59e0b' : 'rgba(168,85,247,0.4)'}`,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                animation: 'chatFadeIn 0.3s ease-out',
              }}
            >
              {msg.type === 'user' && <span style={{ opacity: 0.5 }}>{'> '}</span>}
              {formatText(msg.text)}
            </div>
          ))}

          {loading && (
            <div style={{
              color: '#a855f7',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
            }}>
              <Sparkles size={14} className="ghhost-chat-pulse" />
              <span className="ghhost-chat-pulse">Ghhost is analyzing…</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderTop: '1px solid rgba(168,85,247,0.1)',
          background: 'rgba(0,0,0,0.4)',
          flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Ghhost anything…"
            disabled={loading}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(168,85,247,0.15)',
              borderRadius: '10px',
              padding: '10px 14px',
              color: '#e2e8f0',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '0.75rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor = '#a855f7'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(168,85,247,0.15)'; }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim()
                ? 'rgba(168,85,247,0.12)'
                : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 12px',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading || !input.trim() ? 0.4 : 1,
              transition: 'all 0.2s',
              boxShadow: loading || !input.trim() ? 'none' : '0 0 12px rgba(168,85,247,0.3)',
              flexShrink: 0,
            }}
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* ═══ FLOATING GHOST TRIGGER ═══ */}
      <button
        onClick={toggleChat}
        aria-label="Open Ghhost Insights"
        className="ghhost-fab"
        style={{
          position: 'fixed',
          bottom: '78px',
          right: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: 'none',
          background: isOpen
            ? 'linear-gradient(135deg, #7c3aed, #6d28d9)'
            : 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(124,58,237,0.3))',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 61,
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: isOpen
            ? '0 0 24px rgba(168,85,247,0.5), 0 4px 16px rgba(0,0,0,0.4)'
            : '0 0 20px rgba(168,85,247,0.25), 0 4px 12px rgba(0,0,0,0.3)',
          outline: 'none',
        }}
      >
        {isOpen ? (
          <MessageSquare size={22} color="#e2e8f0" />
        ) : (
          <div style={{ position: 'relative' }}>
            <GhostLogo size={28} glowColor="#a855f7" animate={false} />
            {/* Notification dot */}
            {hasNewMessage && (
              <div style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid #06080f',
                boxShadow: '0 0 8px #22c55e',
              }} />
            )}
          </div>
        )}
        {/* Glow ring animation */}
        {!isOpen && (
          <div
            className="ghhost-fab-ring"
            style={{
              position: 'absolute',
              inset: '-3px',
              borderRadius: '50%',
              border: '1px solid rgba(168,85,247,0.3)',
              pointerEvents: 'none',
            }}
          />
        )}
      </button>
    </>
  );
}
