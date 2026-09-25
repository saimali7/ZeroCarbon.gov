import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/roboto/wght.css";
import "@fontsource-variable/noto-kufi-arabic/wght.css";
import "./globals.css";
import { Providers } from "./_components/providers";
import { SiteFooter } from "./_components/shell/site-footer";
import { SiteHeader } from "./_components/shell/site-header";

export const metadata: Metadata = {
  title: { default: "Zerocarbon.gov · Emissions report review", template: "%s · Zerocarbon.gov" },
  description: "AI review copilot for facility emissions reports under UAE Federal Decree-Law No. 11 of 2024.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow-overlay"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 pt-8 sm:px-6">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
