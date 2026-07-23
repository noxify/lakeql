"use client"

import { useCallback, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"

import { FieldsTab } from "./fields"
import { GeneralTab } from "./general"
import { InfoTab } from "./info"
import { MutationsTab } from "./mutations"
import { PreviewTab } from "./preview"
import { TopBar } from "./top-bar"

const VALID_TABS = [
  "info",
  "general",
  "fields",
  "mutations",
  "preview",
] as const
type TabValue = (typeof VALID_TABS)[number]

function isValidTab(value: string | null): value is TabValue {
  return VALID_TABS.includes(value as TabValue)
}

function getInitialTab(): TabValue {
  const params = new URLSearchParams(window.location.search)
  const tab = params.get("tab")
  return isValidTab(tab) ? tab : "info"
}

export function BuilderTabs() {
  const isMobile = useIsMobile(1024)
  const orientation = isMobile ? "horizontal" : "vertical"
  const [activeTab, setActiveTab] = useState<TabValue>(getInitialTab)

  const handleTabChange = useCallback((value: string | number | null) => {
    if (typeof value !== "string" || !isValidTab(value)) {
      return
    }
    setActiveTab(value)

    const url = new URL(window.location.href)
    if (value === "info") {
      url.searchParams.delete("tab")
    } else {
      url.searchParams.set("tab", value)
    }
    window.history.replaceState(null, "", url.toString())
  }, [])

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      orientation={orientation}
      className={
        isMobile ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 gap-0"
      }
    >
      {/* Sidebar navigation (desktop) */}
      {!isMobile && (
        <aside className="border-border flex w-56 shrink-0 flex-col border-r">
          <TabsList
            variant="line"
            className="w-full flex-col items-start gap-1 bg-transparent p-4"
          >
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="mutations">Mutations</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </aside>
      )}

      {/* Top navigation (mobile) */}
      {isMobile && (
        <TabsList
          variant="line"
          className="border-border h-12! w-full shrink-0 justify-start border-b px-4"
        >
          <TabsTrigger value="info" className="cursor-pointer">
            Info
          </TabsTrigger>
          <TabsTrigger value="general" className="cursor-pointer">
            General
          </TabsTrigger>
          <TabsTrigger value="fields" className="cursor-pointer">
            Fields
          </TabsTrigger>
          <TabsTrigger value="mutations" className="cursor-pointer">
            Mutations
          </TabsTrigger>
          <TabsTrigger value="preview" className="cursor-pointer">
            Preview
          </TabsTrigger>
        </TabsList>
      )}

      {/* Content area — scrolls independently */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TopBar />

        <TabsContent value="info" className="mt-0">
          <InfoTab />
        </TabsContent>
        <TabsContent value="general" className="mt-0">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="fields" className="mt-0">
          <FieldsTab />
        </TabsContent>
        <TabsContent value="mutations" className="mt-0">
          <MutationsTab />
        </TabsContent>
        <TabsContent value="preview" className="mt-0">
          <PreviewTab />
        </TabsContent>
      </div>
    </Tabs>
  )
}
