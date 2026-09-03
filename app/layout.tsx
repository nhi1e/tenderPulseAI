import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TenderPulse AI",
  description: "Medtronic market intelligence from public procurement award data in Vietnam.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
