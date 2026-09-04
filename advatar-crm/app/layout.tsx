import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Advatar",
  description: "Advatar CRM",
};

// Without this every page renders at desktop width on a phone and then
// gets scaled down, which is why the app looked "zoomed out" rather
// than laid out for the screen. `maximum-scale` is deliberately NOT
// set: capping zoom locks out anyone who needs to pinch to read.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the saved theme before the browser paints.
 *
 * This has to be a blocking inline script rather than a React effect:
 * an effect runs after first paint, so a dark-mode user would see a
 * flash of the light palette on every page load. Reading localStorage
 * is wrapped because it throws outright in some privacy modes, and a
 * theme preference is not worth a blank page.
 *
 * Note it only stamps `data-theme` when there IS a stored choice --
 * leaving the attribute off is what lets the CSS fall through to the
 * operating system's own preference for anyone who has never used the
 * toggle.
 */
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("advatar-theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${bebasNeue.variable} ${dmSans.variable} ${spaceMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
