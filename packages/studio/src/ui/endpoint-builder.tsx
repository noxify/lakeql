import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Root component of the LakeQL Endpoint Builder.
 *
 * Phase 1 renders a styled placeholder: it proves the library + precompiled
 * CSS consumption path works end to end (a consumer importing the component
 * and `@lakeql/studio/styles.css` gets correctly styled output with no
 * Tailwind config of its own). The real tree editor, JSON view, validation,
 * and persistence arrive in later phases.
 */
export const EndpointBuilder = () => (
  <div className="bg-background text-foreground flex min-h-svh items-center justify-center p-6">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>LakeQL Endpoint Builder</CardTitle>
        <CardDescription>
          Visual authoring for LakeQL endpoint definitions.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        The builder UI is under construction. This placeholder confirms the
        shared component library and its precompiled styles load correctly.
      </CardContent>
    </Card>
  </div>
)
