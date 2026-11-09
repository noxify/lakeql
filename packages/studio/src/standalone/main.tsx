import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { EndpointBuilder } from "@/ui/endpoint-builder"

import "@/styles/studio.css"

const container = document.querySelector("#root")

if (!container) {
  throw new Error("Standalone entry: #root container not found")
}

createRoot(container).render(
  <StrictMode>
    <EndpointBuilder />
  </StrictMode>
)
