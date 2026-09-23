import type { AltairPluginContextV2, AltairPropertyEditorContribution } from "@haneoka/altair/plugins";
import { FILTER_PRESETS_PATH, parseFilterPresets } from "./presets.js";

export function contributeWebGalEditors(context: AltairPluginContextV2) {
  const editors: readonly AltairPropertyEditorContribution[] = [
    {
      id: "transform",
      panelId: "webgal/transform",
      matches: (node, field) =>
        node.type.plugin === "haneoka.altair-webgal" &&
        node.type.name === "effect.setTransform" &&
        field === "transform",
    },
    {
      id: "perform",
      panelId: "webgal/perform",
      matches: (node, field) => {
        const value = node.arguments[field];
        return (
          node.type.plugin === "haneoka.altair-webgal" &&
          node.type.name === "effect.pixiPerform" &&
          field === "perform" &&
          !!value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          ["rain", "snow", "heavy-snow", "petals", "clear", "color-matrix", "clear-color-matrix"].includes(
            String(value.action),
          )
        );
      },
    },
  ];
  for (const editor of editors) {
    context.contribute("property-editor", editor);
    context.contribute("panel", {
      id: editor.panelId,
      slot: "property",
      async mount(host, context) {
        const { mountWebGalField } = await import("./panel.js");
        context.signal.throwIfAborted();
        return mountWebGalField(host, context, editor.id);
      },
    });
  }
  context.contribute("document-editor", {
    id: "filters",
    label: "Filter presets",
    affectsPreview: false,
    matches: (path) => path === FILTER_PRESETS_PATH,
    validate: (document) => {
      parseFilterPresets(document.text);
    },
  });
}
