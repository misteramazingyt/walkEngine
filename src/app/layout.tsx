import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MOTIF WALK — Cultural Memory Workbench",
  description:
    "A narrative-path discovery instrument: walk Wikipedia, warrant the transitions, compose Draft 0.",
  applicationName: "Motif Walk",
  appleWebApp: {
    capable: true,
    title: "Motif Walk",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3d3d70",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
