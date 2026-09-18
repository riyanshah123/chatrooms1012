import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Poppins gives the rounded, friendly headline feel of the reference design.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "Chatrooms101 — talk to strangers about anything",
    template: "%s · Chatrooms101",
  },
  description:
    "Ten seats, real conversations, and nobody knows who you are. Jump into live rooms about things you actually care about.",
  // Standalone launch + proper status bar when added to a home screen.
  appleWebApp: {
    capable: true,
    title: "chatrooms101",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F1",
  // Let the app paint into the notch/home-indicator area; components opt in
  // to safe-area padding where it matters.
  viewportFit: "cover",
  // Phone-first: the layout is designed for this width, don't let users
  // pinch-zoom into a broken state, but keep accessibility scaling.
  maximumScale: 5,
};

/**
 * Inline theme bootstrap — runs before first paint. Light (white) is the
 * default brand look; dark applies only when the user chose it via the
 * toggle (stored preference), not from the OS setting.
 */
const themeScript = `
(function () {
  try {
    if (localStorage.getItem("cr-theme") === "dark")
      document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Socket.IO must connect DIRECTLY to the API: WebSocket upgrades cannot be
  // proxied through Next middleware. Resolved here (server, at request time)
  // so it works on any host without a rebuild.
  const socketUrl = (process.env.WEB_API_PROXY ?? "").replace(/\/$/, "");
  const socketScript = `window.__CR_SOCKET_URL__=${JSON.stringify(
    socketUrl && !/^https?:\/\//.test(socketUrl) ? `https://${socketUrl}` : socketUrl,
  )};`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: socketScript }} />
      </head>
      <body className={`${inter.variable} ${poppins.variable} font-sans min-h-dvh`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
