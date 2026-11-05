import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const title = "EVgoSmart — Emergency EV charging, delivered";
const description =
  "Stranded with a low EV battery? A mobile charging van reaches you in minutes — live ETA, transparent pricing, and a verified technician. Bengaluru pilot.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: title,
    template: "%s · EVgoSmart",
  },
  description,
  applicationName: "EVgoSmart",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "EVgoSmart",
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f3f5ef",
};

const demoMode = process.env.DEMO_MODE === "true";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        {demoMode && (
          <p role="note" className="bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900">
            Demo environment — simulated fleet, test payments. No real charges.
          </p>
        )}
        {children}
      </body>
    </html>
  );
}
