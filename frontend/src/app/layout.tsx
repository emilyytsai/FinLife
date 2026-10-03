import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinLife",
  description: "See where your money is headed, then ask what if.",
};

/** Must match THEME_KEY in components/ThemeToggle.tsx. Dark is the default; only "light" needs the attribute. */
const THEME_SCRIPT = `try{if(localStorage.getItem("finlife-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
      // The theme script below may set data-theme before React loads; that difference is expected.
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved light/dark choice before the first paint, so the page never flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
