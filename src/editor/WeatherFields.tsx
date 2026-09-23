import type { JsonObject, JsonValue } from "@haneoka/altair/documents";
import { useEditorTranslator, NumberInput } from "@haneoka/altair-ui-react";
import { weatherNames } from "./labels.js";

const object = (value: JsonValue | undefined): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function WeatherFields({ value, onChange }: { value: JsonValue; onChange: (value: JsonValue) => void }) {
  const tr = useEditorTranslator();
  const perform = object(value),
    options = object(perform.options);
  const action = typeof perform.action === "string" ? perform.action : "rain";
  const updateOptions = (next: JsonObject) => onChange({ ...perform, options: next });
  return (
    <div className="transform-fields">
      <label style={{ gridColumn: "1 / -1" }}>
        <span>{tr("Weather")}</span>
        <select value={action} onChange={(event) => onChange({ ...perform, action: event.target.value })}>
          {!Object.hasOwn(weatherNames, action) && <option value={action}>{action}</option>}
          {Object.entries(weatherNames).map(([key, label]) => (
            <option key={key} value={key}>
              {tr(label)}
            </option>
          ))}
        </select>
      </label>
      {action !== "clear" && Object.hasOwn(weatherNames, action) && (
        <>
          {(["foreground", "background"] as const).map((layer) => {
            const values = object(options[layer]);
            return (
              <details key={layer} className="argument-section">
                <summary>{tr(layer === "foreground" ? "Foreground particles" : "Background particles")}</summary>
                {(
                  [
                    ["count", "Particle count", 0, 1],
                    ["speed", "Falling speed", undefined, 0.1],
                    ["scale", "Particle scale", 0, 0.01],
                    ["angle", "Direction (degrees)", undefined, 1],
                    ...(action === "petals" ? [["horizontal", "Horizontal drift", undefined, 0.1] as const] : []),
                  ] as const
                ).map(([key, label, min, step]) => (
                  <label key={key} className="field">
                    <span>{tr(label)}</span>
                    <NumberInput
                      step={step}
                      min={min}
                      max={key === "count" ? 65536 : undefined}
                      placeholder={tr("Default")}
                      value={typeof values[key] === "number" ? values[key] : undefined}
                      onClear={() => {
                        const next = { ...values };
                        delete next[key];
                        updateOptions({ ...options, [layer]: next });
                      }}
                      onCommit={(numeric) => {
                        if (min !== undefined && numeric < min) return;
                        updateOptions({
                          ...options,
                          [layer]: {
                            ...values,
                            [key]: key === "count" ? Math.min(65536, Math.trunc(numeric)) : numeric,
                          },
                        });
                      }}
                    />
                  </label>
                ))}
              </details>
            );
          })}
          <label>
            <span>{tr("Random seed")}</span>
            <NumberInput
              step={1}
              min={0}
              max={4294967295}
              placeholder={tr("Default")}
              value={typeof options.seed === "number" ? options.seed : undefined}
              onClear={() => {
                const next = { ...options };
                delete next.seed;
                updateOptions(next);
              }}
              onCommit={(seed) => {
                if (seed >= 0 && seed <= 4294967295) updateOptions({ ...options, seed: Math.trunc(seed) });
              }}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const { options: _options, ...rest } = perform;
              onChange(rest);
            }}
          >
            {tr("Reset weather settings")}
          </button>
        </>
      )}
    </div>
  );
}
