import { lazy, Suspense } from "react";
import type { JsonValue, JsonObject, AltairEditorWorkspace as EditorSession } from "@haneoka/altair/documents";
import { NumberInput, StructuredTextInput as YamlField, useEditorTranslator } from "@haneoka/altair-ui-react";
const VisualFilters = lazy(() => import("./VisualFilters.js").then((module) => ({ default: module.VisualFilters })));
export function TransformFields({
  value,
  onChange,
  session,
}: {
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  session: EditorSession;
}) {
  const tr = useEditorTranslator();
  const transform: JsonObject = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fields = [
    ["position", "x", "Position X (px)", 0, 1],
    ["position", "y", "Position Y (px)", 0, 1],
    ["scale", "x", "Scale X", 1, 1],
    ["scale", "y", "Scale Y", 1, 1],
    ["rotation", "", "Rotation (degrees)", 0, Math.PI / 180],
    ["alpha", "", "Opacity", 1, 1],
  ] as const;
  return (
    <div className="transform-fields">
      {fields.map(([key, axis, label, fallback, scale]) => {
        const record = transform[key];
        const pair = record && typeof record === "object" && !Array.isArray(record) ? record : {};
        const raw = axis ? pair[axis] : record;
        const value = typeof raw === "number" ? raw / scale : fallback;
        return (
          <label key={`${key}/${axis}`}>
            <span>{tr(label)}</span>
            <NumberInput
              step={key === "scale" || key === "alpha" ? 0.01 : 1}
              value={Number(value.toFixed(6))}
              onCommit={(next) => {
                onChange({
                  ...transform,
                  [key]: axis ? { ...pair, [axis]: next * scale } : next * scale,
                });
              }}
            />
          </label>
        );
      })}
      <Suspense fallback={null}>
        <VisualFilters session={session} value={transform} onChange={onChange} />
      </Suspense>
      <details>
        <summary>{tr("All transform properties")}</summary>
        <YamlField value={transform} onChange={onChange} />
      </details>
    </div>
  );
}
