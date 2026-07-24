"use client";

import React, { createContext, useContext } from 'react';
import { useSession } from 'next-auth/react';

const ProContext = createContext();

/**
 * ProProvider — derives isPro exclusively from the NextAuth session.
 * 
 * The server sets session.user.isPro based on the database User record
 * (subscription status + proExpiresAt check) in auth.js callbacks.
 * This cannot be spoofed via localStorage or DevTools.
 */
export function ProProvider({ children }) {
  const { data: session } = useSession();
  const isPro = session?.user?.isPro === true;

  return (
    <ProContext.Provider value={{ isPro }}>
      {children}
    </ProContext.Provider>
  );
}

export function usePro() {
  return useContext(ProContext);
}
