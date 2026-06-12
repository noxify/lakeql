"use client"
import { configure } from "onedollarstats"
import { useEffect } from "react"

export default function Analytics() {
  useEffect(() => {
    configure({ hostname: "lakeql.dev", devmode: false })
  }, [])

  return null
}
