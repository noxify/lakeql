import { JsonViewPanel } from "./json-view-panel"
import { useShellView } from "./shell-view"
import { FieldsContent } from "./views/fields-content"
import { SettingsContent } from "./views/settings-content"

/**
 * The main content region, switched by the active view. Validations has no
 * dedicated main content — it defers to the Fields view on navigate — so it
 * shows a brief hint pointing at the issue list in the secondary sidebar.
 */
export const MainContent = () => {
  const { view } = useShellView()

  switch (view) {
    case "settings": {
      return <SettingsContent />
    }
    case "fields": {
      return <FieldsContent />
    }
    case "validations": {
      return (
        <p className="text-muted-foreground max-w-prose text-sm">
          Review the consolidated issue list in the panel on the left. Select an
          issue to jump to the offending field in the Fields view.
        </p>
      )
    }
    case "json": {
      return <JsonViewPanel />
    }
    default: {
      return null
    }
  }
}
