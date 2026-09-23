import type { JsonObject, JsonValue } from "@haneoka/altair/documents";
import { useEditorTranslator } from "@haneoka/altair-ui-react";
import { NumberInput } from "@haneoka/altair-ui-react";
const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const presets: Readonly<Record<string, readonly number[]>> = {
  Identity: identity,
  Grayscale: [0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0, 1, 0],
  Sepia: [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0],
  Invert: [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0],
};
function Coefficient({ value, label, onCommit }: { value: number; label: string; onCommit(value: number): void }) {
  return <NumberInput step="0.05" aria-label={label} value={value} onCommit={onCommit} />;
}
export function ColorMatrixFields({ value, onChange }: { value: JsonValue; onChange(value: JsonValue): void }) {
  const tr = useEditorTranslator();
  const effect: JsonObject = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = effect.action !== "clear-color-matrix",
    stored = effect.values;
  const valid =
    Array.isArray(stored) &&
    stored.length === 20 &&
    stored.every((value) => typeof value === "number" && Number.isFinite(value));
  const values = valid ? (stored as number[]) : identity;
  return (
    <div className="color-matrix-editor">
      <label className="model-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            onChange({
              ...effect,
              action: event.target.checked ? "color-matrix" : "clear-color-matrix",
              values,
            })
          }
        />
        {tr("Color transform")}
      </label>
      <label className="field">
        {tr("Color preset")}
        <select
          value=""
          onChange={(event) => {
            const preset = presets[event.target.value];
            if (preset)
              onChange({
                ...effect,
                action: "color-matrix",
                values: [...preset],
              });
          }}
        >
          <option value="">{tr("Custom")}</option>
          {Object.keys(presets).map((name) => (
            <option key={name} value={name}>
              {tr(name)}
            </option>
          ))}
        </select>
      </label>
      {enabled && (
        <>
          {!valid && <p role="alert">{tr("A color matrix requires 20 finite numbers.")}</p>}
          <div className="color-matrix-grid">
            <table>
              <caption>{tr("Output channels from input RGBA")}</caption>
              <thead>
                <tr>
                  <th scope="col"></th>
                  {["R", "G", "B", "A", tr("Offset")].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["R", "G", "B", "A"].map((row, y) => (
                  <tr key={row}>
                    <th scope="row">{row}</th>
                    {Array.from({ length: 5 }, (_, x) => {
                      const index = y * 5 + x;
                      return (
                        <td key={x}>
                          <Coefficient
                            label={tr("{{output}} from {{input}}", {
                              output: row,
                              input: ["R", "G", "B", "A", tr("Offset")][x],
                            })}
                            value={values[index]!}
                            onCommit={(number) => {
                              const next = [...values];
                              next[index] = number;
                              onChange({ ...effect, values: next });
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
