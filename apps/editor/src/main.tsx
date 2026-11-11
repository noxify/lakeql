import { EndpointBuilder } from "@lakeql/studio"
import { ThemeProvider } from "better-themes"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@lakeql/studio/styles.css"

const container = document.querySelector("#root")

if (!container) {
  throw new Error("editor: #root container not found")
}

// The theme provider lives here, in the app that owns `<html>` — the studio is
// a library and stays theme-agnostic. `attribute="class"` puts the `.dark`
// class on the document root, so the studio's `.dark` tokens and the in-`body`
// portalled Base-UI overlays are themed from one place. `defaultTheme="system"`
// + `enableSystem` resolve stored choice → OS preference → light, persisted to
// localStorage by better-themes.
createRoot(container).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <EndpointBuilder />
    </ThemeProvider>
  </StrictMode>
)
