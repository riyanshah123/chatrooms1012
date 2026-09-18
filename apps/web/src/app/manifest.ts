import type { MetadataRoute } from "next";

/**
 * Web app manifest. Lets people add the site to their home screen and launch
 * it without browser chrome, which is the difference between "a website on a
 * phone" and something that feels like an app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "chatrooms101",
    short_name: "chatrooms101",
    description:
      "Ten seats, real conversations, and nobody knows who you are. Jump into live rooms about things you actually care about.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F1",
    theme_color: "#FAF7F1",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
