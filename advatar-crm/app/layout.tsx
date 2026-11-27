import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Fonts are the device's own (SF Pro on Apple, Helvetica or the system
// sans elsewhere), set in globals.css. Nothing is downloaded.

export const metadata: Metadata = {
  title: "Advatar",
  description: "Advatar CRM",
  manifest: "/manifest.webmanifest",
  // app/icon.png and app/apple-icon.png are picked up by filename, so
  // the tab icon and the iOS home-screen icon need no entry here.
  // This is the rest of what iOS reads when someone taps "Add to Home
  // Screen": without it the CRM opens in a Safari tab with the address
  // bar sitting on top of the nav, rather than as an app.
  appleWebApp: {
    capable: true,
    title: "Advatar",
    // "default", not "black-translucent": translucent draws the page
    // UNDER the status bar, which would put the clock on top of the
    // nav. This reserves the space and fills it from `themeColor`.
    statusBarStyle: "default",
  },
  applicationName: "Advatar",
  formatDetection: { telephone: false },
};

// Without this every page renders at desktop width on a phone and then
// gets scaled down, which is why the app looked "zoomed out" rather
// than laid out for the screen. `maximum-scale` is deliberately NOT
// set: capping zoom locks out anyone who needs to pinch to read.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches each theme's own page background, so the notch area and
  // the pull-to-refresh overscroll don't flash the opposite colour on
  // a phone.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a10" },
  ],
  // Keeps the app's own background under the home indicator instead of
  // a white band, now that it can be installed to the home screen.
  viewportFit: "cover",
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
 *
 * The one exception is /enquire (and its video version, /enquire-vsl).
 * That page is the brochure, not the
 * app: it is the first thing a stranger sees of Advatar, and it should
 * look the same for all of them rather than depending on how their
 * phone happens to be set. So with no stored choice it opens light,
 * and the switch beside the wordmark is there for anyone who wants it
 * otherwise. A choice already made still wins -- someone who picked
 * dark and came back is not overruled.
 */
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("advatar-theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
      return;
    }
  } catch (e) {}
  try {
    var p = location.pathname.replace(/\\/+$/, "");
    if (p === "/enquire" || p === "/enquire-vsl") {
      document.documentElement.setAttribute("data-theme", "light");
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
      <body>
        {children}
      </body>
    </html>
  );
}
