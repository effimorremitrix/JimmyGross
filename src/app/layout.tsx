import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Éclaira", template: "%s · Éclaira" },
  description: "Consentement éclairé et questionnaire pré-geste signés à distance, avant le rendez-vous.",
  robots: { index: false, follow: false, nocache: true },
  applicationName: "Éclaira",
};

export const viewport: Viewport = {
  themeColor: "#1f5fa8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-brand"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
