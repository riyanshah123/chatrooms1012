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
    "Scroll endless discussion prompts and trending topics. Join live 10-person chatrooms — always anonymous.",
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
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
