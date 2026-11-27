import { cn } from "cn"
import type { ComponentPropsWithoutRef } from "react"

export const PageContainer = ({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) => (
  <div className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props} />
)
