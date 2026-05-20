import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#fff",
    description: "LakeQL",
    display: "standalone",
    icons: [
      {
        sizes: "any",
        src: "/favicon.ico",
        type: "image/x-icon",
      },
      {
        purpose: "maskable",
        sizes: "192x192",
        src: "/web-app-manifest-192x192.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/web-app-manifest-512x512.png",
        type: "image/png",
      },
    ],
    name: "LakeQL",
    short_name: "LakeQL",
    start_url: "/",
    theme_color: "#fff",
  }
}
