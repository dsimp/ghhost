import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Ghhost - Professional Sports Analytics",
  description: "Ghhost is a super analytical app for professional sports, providing users with super detailed insight and predictions.",
};

import GlobalNav from "@/components/GlobalNav";
import { ProProvider } from "@/context/ProContext";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body style={{ margin: 0, padding: 0, background: 'var(--bg-dark)' }}>
        <ProProvider>
          <GlobalNav>
            {children}
          </GlobalNav>
        </ProProvider>
      </body>
    </html>
  );
}
