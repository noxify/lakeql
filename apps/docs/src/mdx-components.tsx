import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { Children, isValidElement } from "react"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { CodeBlock, Command } from "renoun/components"
import type { MDXComponents } from "renoun/mdx"
import { createSlug } from "renoun/mdx"

import { Heading } from "@/components/mdx/heading"
import { ImageHandler } from "@/components/mdx/image-handler"
import {
  StepperComponent,
  StepperItemComponent,
} from "@/components/mdx/stepper"
import {
  Accordion as BaseAccordion,
  AccordionContent as BaseAccordionContent,
  AccordionItem as BaseAccordionItem,
  AccordionTrigger as BaseAccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { MermaidDiagram } from "./components/mdx/mermaid"
import { RailroadDiagram } from "./components/mdx/railroad"

type AnchorProps = ComponentPropsWithoutRef<"a">

type ImageMode = "default" | "zoom"
type ImagePreviewFit = "cover" | "contain"

function parsePositiveInt(value?: string): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseMode(normalized: string): ImageMode | undefined {
  const modeMatch = normalized.match(
    /\bmode\s*[:=]\s*(default|preview|zoom)\b/u
  )

  if (modeMatch?.[1]) {
    return modeMatch[1] === "preview" ? "zoom" : (modeMatch[1] as ImageMode)
  }

  if (normalized.includes("preview") || normalized.includes("zoom")) {
    return "zoom"
  }

  if (normalized.includes("default")) {
    return "default"
  }

  return undefined
}

function parsePreviewFit(normalized: string): ImagePreviewFit | undefined {
  const fitMatch = normalized.match(/\bfit\s*[:=]\s*(cover|contain)\b/u)

  if (fitMatch?.[1]) {
    return fitMatch[1] as ImagePreviewFit
  }

  if (normalized.includes("contain")) {
    return "contain"
  }

  if (normalized.includes("cover")) {
    return "cover"
  }

  return undefined
}

function parseSizeOptions(normalized: string): {
  width?: number
  height?: number
} {
  const widthMatch = normalized.match(/\b(?:width|w)\s*[:=]\s*(\d+)\b/u)
  const heightMatch = normalized.match(/\b(?:height|h)\s*[:=]\s*(\d+)\b/u)

  return {
    width: parsePositiveInt(widthMatch?.[1]),
    height: parsePositiveInt(heightMatch?.[1]),
  }
}

function parseImageOptionsFromSources(sources: (string | undefined)[]): {
  mode?: ImageMode
  previewFit?: ImagePreviewFit
  width?: number
  height?: number
} {
  let mode: ImageMode | undefined
  let previewFit: ImagePreviewFit | undefined
  let width: number | undefined
  let height: number | undefined

  for (const source of sources) {
    if (!source) {
      continue
    }

    const normalized = source.toLowerCase()
    const sizeOptions = parseSizeOptions(normalized)

    mode ??= parseMode(normalized)
    previewFit ??= parsePreviewFit(normalized)
    width ??= sizeOptions.width
    height ??= sizeOptions.height
  }

  return { mode: mode ?? "default", previewFit, width, height }
}

export function useMDXComponents() {
  return {
    p(paragraph) {
      const children = Children.toArray(paragraph.children)

      const hasImageChild = children.some((child) => {
        if (!isValidElement(child)) {
          return false
        }

        if (child.type === "img") {
          return true
        }

        if (typeof child.type === "function") {
          const component = child.type as {
            name?: string
            displayName?: string
          }
          const componentName = component.displayName ?? component.name ?? ""
          return /image|img/iu.test(componentName)
        }

        return false
      })

      // Image-only paragraphs should not be wrapped in <p>, otherwise block
      // wrappers inside the mapped image component can cause hydration errors.
      if (hasImageChild && children.length === 1) {
        return <>{paragraph.children}</>
      }

      // If text and image are mixed, prefer a <div> to avoid invalid HTML
      // descendants (<section>/<div>) inside a paragraph element.
      if (hasImageChild) {
        return <div>{paragraph.children}</div>
      }

      return <p>{paragraph.children}</p>
    },
    h1: (props) => <Heading level={1} {...props} />,
    h2: (props) => <Heading level={2} {...props} />,
    h3: (props) => <Heading level={3} {...props} />,
    h4: (props) => <Heading level={4} {...props} />,
    h5: (props) => <Heading level={5} {...props} />,
    h6: (props) => <Heading level={6} {...props} />,
    a: ({ href, children, ...props }: AnchorProps) => {
      if (!href) {
        return (
          <Link href="/" prefetch={false}>
            ###INVALID_LINK###
          </Link>
        )
      }

      if (
        href.startsWith("http") ||
        href.startsWith("https") ||
        href.startsWith("mailto")
      ) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
            <ExternalLinkIcon className="ml-1 inline h-4 w-4" />
          </a>
        )
      }

      if (href.startsWith("#")) {
        return (
          <a href={href} {...props}>
            {children}
          </a>
        )
      }

      return (
        <>
          <Link href={href} {...props} prefetch={false}>
            {children ?? href}
          </Link>
        </>
      )
    },
    // markdown image handler
    img: ({ title, src, alt, width, height, ...props }) => {
      // Markdown image options can come from title, alt text hints,
      // or URL fragments like #mode=zoom&fit=cover.
      const srcValue =
        typeof src === "string"
          ? src
          : typeof src === "object" && src && "src" in src
            ? String(src.src)
            : ""
      const altValue = typeof alt === "string" ? alt : ""
      const srcFragment = srcValue?.split("#").at(1)
      const options = parseImageOptionsFromSources([
        title,
        altValue,
        srcFragment,
      ])

      const widthValue =
        typeof width === "number"
          ? width
          : typeof width === "string"
            ? Number(width)
            : options.width

      const heightValue =
        typeof height === "number"
          ? height
          : typeof height === "string"
            ? Number(height)
            : options.height

      return (
        <ImageHandler
          src={srcValue}
          alt={altValue}
          width={
            Number.isFinite(widthValue as number) && (widthValue as number) > 0
              ? (widthValue as number)
              : undefined
          }
          height={
            Number.isFinite(heightValue as number) &&
            (heightValue as number) > 0
              ? (heightValue as number)
              : undefined
          }
          {...props}
          {...options}
        />
      )
    },
    // if you decide to use `<Image />` inside your mdx, you have the possibility to overwrite
    // the default values ( e.g. for width, height or className ) - we do this differently from the `img` tag above
    // because we think if you use `<Image />` inside your mdx, you should have this flexibility
    // if this is not what you want - feel free to change the code below or import the `Image` component directly
    Image: (props) => <ImageHandler {...props} />,

    Note: ({ title, children }: { title?: string; children: ReactNode }) => (
      <Alert variant={"default"} className="my-4">
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription className="block">{children}</AlertDescription>
      </Alert>
    ),
    Warning: ({ title, children }: { title?: string; children: ReactNode }) => (
      <Alert variant={"destructive"} className="my-4">
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription className="block">{children}</AlertDescription>
      </Alert>
    ),

    table: ({ children }: { children?: ReactNode }) => (
      <div className="my-4 rounded-md border bg-white dark:border-gray-700 dark:bg-transparent">
        <div className="w-full overflow-auto">
          <Table>{children}</Table>
        </div>
      </div>
    ),

    thead: ({ children }: { children?: ReactNode }) => (
      <TableHeader>{children}</TableHeader>
    ),
    tbody: ({ children }: { children?: ReactNode }) => (
      <TableBody>{children}</TableBody>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <TableHead>{children}</TableHead>
    ),
    tr: ({ children }: { children?: ReactNode }) => (
      <TableRow>{children}</TableRow>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <TableCell>{children}</TableCell>
    ),

    dl: ({ children }: { children?: ReactNode }) => (
      <dl className="divide-y divide-gray-100">
        <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
          {children}
        </div>
      </dl>
    ),

    dt: ({ children }: { children?: ReactNode }) => (
      <dt className="text-primary text-sm leading-6 font-medium">{children}</dt>
    ),

    dd: ({ children }: { children?: ReactNode }) => (
      <dd className="text-primary mt-1 text-sm leading-6 sm:col-span-2 sm:mt-0">
        {children}
      </dd>
    ),

    DescriptionList: ({ children }: { children: ReactNode }) => (
      <dl className="divide-accent-foreground/15 divide-y">{children}</dl>
    ),

    DescriptionListItem: ({
      label,
      children,
    }: {
      label: string
      children: ReactNode
    }) => (
      <div className="px-0 py-6 lg:grid lg:grid-cols-3 lg:gap-4">
        <dt className="text-primary text-sm leading-6 font-bold lg:mt-0">
          {label}
        </dt>
        <dd className="text-primary mt-1 text-sm leading-6 lg:col-span-2 lg:mt-0">
          {children}
        </dd>
      </div>
    ),

    Stepper: ({ children }: { children: ReactNode }) => (
      <StepperComponent>{children}</StepperComponent>
    ),
    StepperItem: ({
      title,
      children,
    }: {
      title: string
      children: ReactNode
    }) => <StepperItemComponent title={title}>{children}</StepperItemComponent>,

    Tabs: ({
      defaultValue,
      children,
    }: {
      defaultValue?: string
      children: ReactNode
    }) => <Tabs defaultValue={defaultValue}>{children}</Tabs>,
    TabsTrigger: ({
      value,
      children,
    }: {
      value: string
      children: ReactNode
    }) => <TabsTrigger value={value}>{children}</TabsTrigger>,
    TabsList: ({ children }: { children: ReactNode }) => (
      <TabsList>{children}</TabsList>
    ),
    TabsContent: ({
      value,
      children,
    }: {
      value: string
      children: ReactNode
    }) => <TabsContent value={value}>{children}</TabsContent>,

    Accordion: ({
      children,
      multiple,
      orientation,
    }: {
      children: ReactNode
      multiple?: boolean
      orientation?: "horizontal" | "vertical"
    }) => (
      <BaseAccordion multiple={multiple} orientation={orientation}>
        {children}
      </BaseAccordion>
    ),
    AccordionItem: ({
      children,
      title,
    }: {
      children: ReactNode
      title: string
    }) => (
      <BaseAccordionItem value={createSlug(title)}>
        <BaseAccordionTrigger>{title}</BaseAccordionTrigger>
        <BaseAccordionContent>{children}</BaseAccordionContent>
      </BaseAccordionItem>
    ),
    CodeBlock: (props) => {
      if (props.language === "mermaid") {
        const { preview = false } = props
        return (
          <MermaidDiagram code={props.children as string} preview={preview} />
        )
      }

      if (props.language === "railroad") {
        const { preview = false } = props
        return (
          <RailroadDiagram code={props.children as string} preview={preview} />
        )
      }

      return <CodeBlock {...props} />
    },

    Command,
  } satisfies MDXComponents
}
