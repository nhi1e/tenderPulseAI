import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TenderPulse AI Demo",
  description: "A demo tender intelligence dashboard for Vietnam public healthcare procurement.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
