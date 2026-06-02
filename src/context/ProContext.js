"use client";

import React, { createContext, useState, useContext, useEffect } from 'react';

const ProContext = createContext();

export function ProProvider({ children }) {
  const [isPro, setIsPro] = useState(false);

  // Load state from localStorage if it exists so it persists across refreshes
  useEffect(() => {
    const saved = localStorage.getItem('ghhost_isPro');
    if (saved !== null) {
      setIsPro(saved === 'true');
    }
  }, []);

  const togglePro = () => {
    setIsPro(prev => {
      const next = !prev;
      localStorage.setItem('ghhost_isPro', next);
      return next;
    });
  };

  return (
    <ProContext.Provider value={{ isPro, togglePro }}>
      {children}
    </ProContext.Provider>
  );
}

export function usePro() {
  return useContext(ProContext);
}
