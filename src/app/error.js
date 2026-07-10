"use client";

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global UI Error Caught by Boundary:", error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
      textAlign: 'center',
      color: 'white',
      background: 'var(--bg-dark)'
    }}>
      <div style={{
         background: 'rgba(239, 68, 68, 0.1)',
         border: '1px solid rgba(239, 68, 68, 0.3)',
         borderRadius: '50%',
         padding: '20px',
         marginBottom: '20px'
      }}>
         <AlertTriangle size={48} color="#ef4444" />
      </div>
      
      <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 10px 0' }}>Whoops! Something went wrong.</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 30px' }}>
        The Ghhost engine encountered an unexpected error while trying to render this page.
      </p>
      
      <div style={{
         background: 'rgba(0,0,0,0.3)',
         border: '1px solid rgba(255,255,255,0.1)',
         padding: '15px',
         borderRadius: '8px',
         maxWidth: '600px',
         width: '100%',
         overflowX: 'auto',
         textAlign: 'left',
         marginBottom: '30px'
      }}>
         <code style={{ fontSize: '0.8rem', color: '#f87171' }}>
            {error.message || "Unknown rendering error occurred"}
         </code>
      </div>

      <button
        onClick={() => reset()}
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          color: 'white',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '1rem',
          transition: 'transform 0.2s',
          boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        Try Again
      </button>
    </div>
  );
}
