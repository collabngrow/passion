import type { MetadataRoute } from "next";

/**
 * Web app manifest (master_prompt.md §46).
 *
 * `start_url` is "/" rather than "/journey": a participant reopening the
 * installed app may have been signed out or may never have bound an invitation,
 * and the root page is the one that can decide where they belong. Deep-linking
 * the installed app straight into the journey would show the journey's own
 * signed-out state instead of the way back in.
 *
 * There are no shortcuts and no share targets. Every route past the root is
 * invitation-bound, so a launcher shortcut would be an icon that fails for
 * anyone who is not the participant it was installed for.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CollabNGrow Passion Analyzer",
    short_name: "Passion Analyzer",
    description:
      "A private, invitation-only reflection on what matters to you and who you are choosing to become.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#e0023f",
    // The experience is invitation-only and never indexed (§7); a manifest with
    // no categories keeps it out of app catalogues that read them.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
