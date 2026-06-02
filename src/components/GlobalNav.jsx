"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePro } from '@/context/ProContext';

export default function GlobalNav({ children }) {
  const pathname = usePathname();
  const { isPro, togglePro } = usePro();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg-dark)' }}>
      
      {/* FIXED TOP HEADER */}
      <header style={{ 
         position: 'fixed', 
         top: 0, 
         left: 0, 
         right: 0, 
         height: '60px', 
         background: 'rgba(10, 10, 12, 0.85)', 
         backdropFilter: 'blur(16px)', 
         borderBottom: '1px solid rgba(255,255,255,0.05)',
         display: 'flex', 
         justifyContent: 'space-between', 
         alignItems: 'center', 
         padding: '0 20px',
         zIndex: 50,
         maxWidth: '1400px', 
         margin: '0 auto'
      }}>
         <Link href="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ 
               fontSize: '1.8rem', 
               background: 'linear-gradient(to right, #ffffff, #a1a1aa)', 
               WebkitBackgroundClip: 'text', 
               color: 'transparent', 
               letterSpacing: '-0.02em', 
               fontWeight: 900,
               margin: 0
            }}>
               Ghhost
            </h1>
         </Link>
         <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* PRO TOGGLE SWITCH */}
            <div 
               onClick={togglePro}
               style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  background: isPro ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255,255,255,0.05)',
                  border: isPro ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
               }}
            >
               <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isPro ? '#f472b6' : '#a1a1aa' }}>
                  {isPro ? 'PRO' : 'FREE'}
               </span>
               <div style={{ 
                  width: '32px', 
                  height: '18px', 
                  background: isPro ? '#f472b6' : '#3f3f46', 
                  borderRadius: '10px',
                  position: 'relative',
                  transition: 'background 0.2s'
               }}>
                  <div style={{ 
                     position: 'absolute', 
                     top: '2px', 
                     left: isPro ? '16px' : '2px', 
                     width: '14px', 
                     height: '14px', 
                     background: 'white', 
                     borderRadius: '50%',
                     transition: 'left 0.2s'
                  }} />
               </div>
            </div>

            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'black', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
               <img src="/ghost-logo.png" alt="Ghhost" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
         </div>
      </header>

      {/* MAIN SCROLLABLE CONTENT */}
      {/* Padding top 60px for header, padding bottom 80px for tab bar */}
      <main style={{ flex: 1, overflowY: 'auto', paddingTop: '60px', paddingBottom: '80px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
         {children}
      </main>

      {/* FIXED BOTTOM TAB BAR */}
      <nav style={{ 
         position: 'fixed', 
         bottom: 0, 
         left: 0, 
         right: 0, 
         height: '80px', 
         background: 'rgba(15, 15, 18, 0.95)', 
         backdropFilter: 'blur(20px)', 
         borderTop: '1px solid rgba(255,255,255,0.08)',
         display: 'flex', 
         justifyContent: 'space-around', 
         alignItems: 'center',
         paddingBottom: '5px', // slightly nudge up from absolute bottom
         zIndex: 50,
         maxWidth: '1400px',
         margin: '0 auto'
      }}>
         
         <Link href="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/' ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🏠
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s' }}>Home</span>
         </Link>

         <Link href="/nba" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/nba' ? 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🏀
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/nba' ? '#f97316' : 'var(--text-muted)', transition: 'all 0.2s' }}>NBA</span>
         </Link>

         <Link href="/mlb" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/mlb' ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               ⚾
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/mlb' ? '#3b82f6' : 'var(--text-muted)', transition: 'all 0.2s' }}>MLB</span>
         </Link>

         <Link href="/lab" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/lab' ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🧪
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/lab' ? '#a855f7' : 'var(--text-muted)', transition: 'all 0.2s' }}>The Lab</span>
         </Link>

      </nav>
    </div>
  );
}
