import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Sans_Myanmar, Outfit } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import { I18nProvider } from "@/lib/i18n";
import { StoreProvider } from "@/lib/store";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const notoJP = Noto_Sans_JP({ variable: "--font-noto-jp", subsets: ["latin"], weight: ["400", "500", "600"] });
const notoMY = Noto_Sans_Myanmar({ variable: "--font-noto-my", subsets: ["myanmar"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Felixia Hub",
  description: "Content, approvals and recruitment workspace for Felixia Recruitment",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${notoJP.variable} ${notoMY.variable}`}>
      <body className="antialiased">
        <I18nProvider>
          <StoreProvider>
            <Shell>{children}</Shell>
          </StoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
