import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";

import { RegisterServiceWorker } from "@/components/pwa/register-sw";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-loader",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
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
      <html lang="en" className={fraunces.variable}>
        <head>
          {/*
            General Sans — served from Fontshare. We hotlink rather than
            bundle via next/font/local so the build doesn't require a woff2
            on disk; swap this for a self-hosted face before going to prod.
          */}
          <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
          <link
            rel="stylesheet"
            href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap"
          />
        </head>
        <body>
          {children}
          <RegisterServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  );
}
