import { Inter, Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Ghhost — Predictive Intelligence",
  description: "Ghhost is a predictive sports intelligence platform delivering data-driven predictions and deep analytics across NBA, WNBA, NFL, and MLB.",
};

import GlobalNav from "@/components/GlobalNav";
import { ProProvider } from "@/context/ProContext";
import { Providers } from "@/components/Providers";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${geistMono.variable}`}>
      <body style={{ margin: 0, padding: 0, background: 'var(--bg-dark)' }}>
        <Providers>
          <ProProvider>
            <GlobalNav>
              {children}
            </GlobalNav>
          </ProProvider>
        </Providers>
      </body>
    </html>
  );
}
