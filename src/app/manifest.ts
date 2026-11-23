import type { MetadataRoute } from "next";

/** Lets people "Add to Home Screen" on their phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Felixia Hub",
    short_name: "Felixia Hub",
    description: "Content, approvals and recruitment workspace for Felixia Recruitment",
    start_url: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#f5f6f8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
