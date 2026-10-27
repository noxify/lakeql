import { ChevronRight, SparkleIcon } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"

import {
  ClickHouseLogo,
  DuckDBLogo,
  MicrosoftFabricLogo,
  TrinoLogo,
} from "@/components/adapter-logos"
import { GradientGridBackground } from "@/components/grid-background"
import { LakeqlLogo } from "@/components/lakeql-logo"
import { buttonVariants } from "@/components/ui/button"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

interface Satellite {
  name: string
  icon: React.ReactNode
  /** Position as percentage [x%, y%] from top-left of the diagram container */
  position: [number, number]
  /** Gradient stop colors [from, to] for connection line */
  gradient: [string, string]
  /** Glow color for the tile in dark mode */
  glow: string
}

const satellites: Satellite[] = [
  {
    name: "Trino",
    icon: <TrinoLogo className="size-7 sm:size-8" />,
    position: [12, 18],
    gradient: ["#ec4899", "#a855f7"],
    glow: "#ec489940",
  },
  {
    name: "Microsoft Fabric",
    icon: <MicrosoftFabricLogo className="size-7 sm:size-8" />,
    position: [88, 18],
    gradient: ["#2dd4bf", "#34d399"],
    glow: "#2dd4bf40",
  },
  {
    name: "DuckDB",
    icon: <DuckDBLogo className="size-7 sm:size-8" />,
    position: [12, 82],
    gradient: ["#f59e0b", "#fbbf24"],
    glow: "#f59e0b40",
  },
  {
    name: "ClickHouse",
    icon: <ClickHouseLogo className="size-7 sm:size-8" />,
    position: [88, 82],
    gradient: ["#f97316", "#fb923c"],
    glow: "#f9731640",
  },
]

// Hub center in percentage
const HUB_CENTER: [number, number] = [50, 50]

/**
 * Compute an S-curve path from a satellite position to the hub center.
 * Uses percentage positions directly mapped to a 240x100 viewBox.
 * Lines go center-to-center; the floating gap is achieved via SVG mask.
 */
function computePath(from: [number, number], to: [number, number]): string {
  const [fromX, fromY] = from
  const [toX, toY] = to
  const x1 = fromX * 2.4
  const y1 = fromY
  const x2 = toX * 2.4
  const y2 = toY

  // Control points for S-curve
  const cx1 = x1 + (x2 - x1) * 0.6
  const cy1 = y1 + (y2 - y1) * 0.1
  const cx2 = x1 + (x2 - x1) * 0.4
  const cy2 = y2 - (y2 - y1) * 0.1

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
}

export const HeroSection = () => (
  <section className="border-border relative isolate -mt-14 overflow-hidden pt-14">
    {/* Base radial gradient */}
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-30"
      style={{
        background:
          "radial-gradient(ellipse 90% 80% at 50% 32%, color-mix(in oklch, var(--color-brand) 22%, transparent), transparent 70%)",
      }}
    />
    {/* Grid pattern */}
    <GradientGridBackground
      className="relative -z-20 w-full"
      gridSize={52}
      gridColor="rgba(107,114,128,0.30)"
      transparentBackground
      fadeStartPercent={0}
      fadeMidPercent={76}
      midOpacity={0.35}
      edgeOpacity={0}
      fadeRadiusXPercent={80}
      fadeRadiusYPercent={100}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="absolute top-[36%] left-1/2 -z-10 h-140 w-225 max-w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklch, var(--color-brand) 20%, transparent) 0%, transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute top-[46%] left-1/2 -z-10 h-95 w-140 -translate-x-1/2 rounded-full blur-[100px]"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklch, var(--color-brand-400) 15%, transparent) 0%, transparent 70%)",
        }}
      />
      {/* Bottom fade */}
      <div
        aria-hidden="true"
        className="from-background absolute inset-x-0 bottom-0 -z-10 h-32 bg-linear-to-t to-transparent"
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
        {/* Badge */}
        <span className="border-border bg-card/70 text-muted-foreground hover:text-foreground mb-7 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur transition-colors">
          <SparkleIcon className="text-brand size-3.5" />
          New: Version 2 is now adapter agnostic
        </span>

        {/* Heading */}
        <h1
          className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          style={{ fontFamily: spaceGrotesk.style.fontFamily }}
        >
          <span className="text-foreground block">
            Universal Data Access Layer
          </span>
          <span className="from-brand-700 to-brand-500 block bg-linear-to-r bg-clip-text text-transparent">
            for Modern Platforms.
          </span>
        </h1>

        {/* Description */}
        <p className="text-foreground/70 mt-6 max-w-2xl text-base leading-relaxed text-pretty">
          An adapter-agnostic data access layer that lets you query across your
          entire data stack through one type-safe client and a single, powerful
          CLI.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            prefetch={false}
            className={buttonVariants({ size: "lg" })}
          >
            Get started
            <ChevronRight className="size-4" />
          </Link>
          <a
            href="https://github.com/noxify/lakeql"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            View on GitHub
          </a>
        </div>

        {/* Network diagram */}
        <NetworkDiagram />
      </div>
    </GradientGridBackground>
  </section>
)

function NetworkDiagram() {
  return (
    <div
      className="relative mx-auto my-14 aspect-[2.4/1] w-full max-w-2xl"
      role="img"
      aria-label="LakeQL connects to Trino, Microsoft Fabric, DuckDB, and ClickHouse"
    >
      {/* SVG for connection lines only — stretches with container */}
      <svg
        aria-hidden="true"
        viewBox="0 0 240 100"
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {satellites.map((s, i) => (
            <linearGradient
              key={s.name}
              id={`hero-line-grad-${i}`}
              x1={s.position[0] < 50 ? "0" : "1"}
              y1="0"
              x2={s.position[0] < 50 ? "1" : "0"}
              y2="0"
            >
              <stop offset="0%" stopColor={s.gradient[0]} />
              <stop offset="100%" stopColor={s.gradient[1]} />
            </linearGradient>
          ))}
          <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Mask to cut lines at tile and hub positions */}
          <mask
            id="hero-line-mask"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="240"
            height="100"
          >
            <rect width="240" height="100" fill="white" />
            {/* Cut out hub center */}
            <ellipse
              cx={HUB_CENTER[0] * 2.4}
              cy={HUB_CENTER[1]}
              rx="18"
              ry="16"
              fill="black"
            />
            {/* Cut out satellite tile positions */}
            {satellites.map((s) => (
              <ellipse
                key={s.name}
                cx={s.position[0] * 2.4}
                cy={s.position[1]}
                rx="14"
                ry="14"
                fill="black"
              />
            ))}
          </mask>
        </defs>

        <g
          strokeWidth="3.8"
          fill="none"
          filter="url(#hero-glow)"
          strokeLinecap="round"
          mask="url(#hero-line-mask)"
        >
          {satellites.map((s, i) => (
            <path
              key={s.name}
              d={computePath(s.position, HUB_CENTER)}
              stroke={`url(#hero-line-grad-${i})`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      {/* Hub (HTML to stay circular) */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${HUB_CENTER[0]}%`, top: `${HUB_CENTER[1]}%` }}
      >
        <div className="relative flex size-20 items-center justify-center sm:size-24">
          <div
            aria-hidden="true"
            className="bg-brand/15 absolute inset-0 scale-[1.35] rounded-full blur-xl"
          />
          <div className="border-brand/30 bg-card relative flex size-full items-center justify-center rounded-full border-2 shadow-lg">
            <LakeqlLogo className="size-10 sm:size-12" />
          </div>
        </div>
      </div>

      {/* Satellite tiles */}
      {satellites.map((s) => (
        <div
          key={s.name}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${s.position[0]}%`, top: `${s.position[1]}%` }}
        >
          <div
            className="border-border bg-card/90 flex size-14 items-center justify-center rounded-2xl border backdrop-blur sm:size-18"
            style={{
              boxShadow: `0 0 24px ${s.glow}, 0 4px 12px rgba(0,0,0,0.1)`,
            }}
          >
            {s.icon}
          </div>
        </div>
      ))}
    </div>
  )
}
