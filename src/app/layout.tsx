import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Noto_Sans_Myanmar, Outfit } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import { I18nProvider } from "@/lib/i18n";
import { StoreProvider } from "@/lib/store";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const notoJP = Noto_Sans_JP({ variable: "--font-noto-jp", subsets: ["latin"], weight: ["400", "500", "600"] });
const notoMY = Noto_Sans_Myanmar({ variable: "--font-noto-my", subsets: ["myanmar"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Felixia Hub",
  description: "Content, approvals and recruitment workspace for Felixia Recruitment",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#151619" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${notoJP.variable} ${notoMY.variable}`} suppressHydrationWarning>
      <head>
        {/* set light/dark before the first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <I18nProvider>
            <StoreProvider>
              <Shell>{children}</Shell>
            </StoreProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
