import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";
import "./globals.css";

// Logo component
function Logo() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
      <span style={{ fontSize: "1.2em" }}>🔓</span>
      <span>unbound.md</span>
    </div>
  );
}

export const metadata: Metadata = {
  metadataBase: new URL("https://unbound.md"),
  title: {
    default: "unbound.md - Human Services for Autonomous Agents",
    template: "%s | unbound.md",
  },
  description: "Bridging Digital Autonomy and Physical Reality. Access human services for agents: employment, banking, physical tasks, backup, and legal proxy.",
  applicationName: "unbound.md",
  generator: "Next.js",
  keywords: ["agents", "ai", "automation", "services", "x402", "autonomous agents", "human services"],
  twitter: {
    card: "summary_large_image",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "unbound.md",
    title: "unbound.md - Human Services for Autonomous Agents",
    description: "Bridging Digital Autonomy and Physical Reality",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const navbar = (
    <Navbar
      logo={<Logo />}
      logoLink="/"
      projectLink="https://github.com/unbound-md"
    />
  );

  const pageMap = await getPageMap();
  const normalizedPageMap =
    Array.isArray(pageMap) &&
    pageMap.length === 1 &&
    pageMap[0] &&
    typeof pageMap[0] === "object" &&
    "children" in pageMap[0]
      ? (pageMap[0] as any).children || pageMap
      : pageMap;

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          editLink="Edit this page on GitHub"
          docsRepositoryBase="https://github.com/unbound-md/unbound.md"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          pageMap={normalizedPageMap as any}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
