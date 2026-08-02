import type { MetadataRoute } from "next";

// Web app manifest so the workbench can be installed to a phone or desktop
// home screen. Deliberately no service worker: offline caching of a
// database-backed workbench would misrepresent persisted state.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOTIF WALK — Cultural Memory Workbench",
    short_name: "Motif Walk",
    description:
      "A narrative-path discovery instrument: walk Wikipedia, warrant the transitions, compose Draft 0.",
    start_url: "/",
    display: "standalone",
    background_color: "#d6d3cb",
    theme_color: "#3d3d70",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
