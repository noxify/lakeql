import { EndpointBuilder } from "@lakeql/studio"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@lakeql/studio/styles.css"

const container = document.querySelector("#root")

if (!container) {
  throw new Error("editor: #root container not found")
}

createRoot(container).render(
  <StrictMode>
    <EndpointBuilder />
  </StrictMode>
)
