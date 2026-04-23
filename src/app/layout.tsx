import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import localFont from "next/font/local";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-loader",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

/**
 * General Sans is loaded from Fontshare at deploy-time. We keep a local
 * fallback so builds don't fail without network; the real face is served
 * from /public/fonts once added (see README, §Fonts).
 */
const generalSans = localFont({
  variable: "--font-sans-loader",
  display: "swap",
  src: [
    {
      path: "../../public/fonts/GeneralSans-Variable.woff2",
      weight: "200 700",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Form Studio",
    template: "%s · Form Studio",
  },
  description: "The studio software for trainers who think like craftspeople.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Form Studio",
    description: "The studio software for trainers who think like craftspeople.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F2EB",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#4A5540",
          colorBackground: "#F6F2EB",
          colorText: "#1F1E1B",
          colorInputBackground: "#F6F2EB",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          borderRadius: "0.5rem",
        },
      }}
    >
      <html lang="en" className={`${fraunces.variable} ${generalSans.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
