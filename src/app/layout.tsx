import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";

import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { ToastProvider } from "@/components/ui/toast";
import { getCanonicalUrl } from "@/lib/urls";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-loader",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalUrl()),
  title: {
    default: "Form Studio",
    template: "%s · Form Studio",
  },
  description: "The studio software for trainers who think like craftspeople.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/favicon.svg",
  },
  alternates: {
    // Canonical link for SEO — pins every page to the production
    // origin even when reached via the Vercel preview hostname.
    // Sub-pages can override via their own `alternates.canonical`.
    canonical: "/",
  },
  openGraph: {
    title: "Form Studio",
    description: "The studio software for trainers who think like craftspeople.",
    url: getCanonicalUrl(),
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
      // Pin clerk-js to an EXACT 6.x version (matches the major of the
      // server-side `@clerk/nextjs@6.x` resolved from the lockfile).
      //
      // Why a pin at all: Clerk's CDN serves the shortname URL
      // (e.g. `@clerk/clerk-js@6/...`) as a 307 redirect to the exact
      // versioned build. Browsers refuse to follow that redirect for
      // cross-origin scripts loaded with `crossorigin="anonymous"`,
      // which Clerk sets on its loader tag. Result: SignUp/SignIn
      // widgets never hydrate and auth routes throw.
      //
      // Why 6.10.1 specifically: previously pinned to 5.125.10, which
      // caused a client/server major-version mismatch with
      // `@clerk/nextjs@6.x`. That mismatch is the most likely cause of
      // the smart-CAPTCHA widget failing to mount on /sign-up,
      // surfacing as `captcha_missing_token` on the Clerk API response.
      // Aligning client to 6.x is the targeted fix.
      clerkJSVersion="6.10.1"
      appearance={{
        variables: {
          colorPrimary: "#4A5540",
          // TODO(clerk-v6): `colorBackground` was a v5 key that's been
          // deprecated/removed in the v6 appearance API. Commented out
          // pre-emptively while we verify the v6 SDK doesn't object to
          // it. Re-add via the v6 equivalent (`colorNeutral` or a
          // component-specific override) once sign-up/sign-in confirmed
          // working with 6.x.
          // colorBackground: "#F6F2EB",
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
          <ToastProvider>
            {children}
            <RegisterServiceWorker />
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
