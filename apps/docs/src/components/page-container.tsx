import type { ComponentPropsWithoutRef } from "react"

import { cn } from "@/lib/utils"

export const PageContainer = ({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) => (
  <div className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props} />
)
