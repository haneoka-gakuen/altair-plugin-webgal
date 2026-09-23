import { useState, useSyncExternalStore } from "react";
import { Save, Trash2, Upload, Download, RotateCcw } from "lucide-react";
import { serializeAuthoredText, type JsonObject } from "@haneoka/altair/documents";
import { FILTER_PRESETS_PATH as PRESETS_PATH, parseFilterPresets as parse, type PresetLibrary } from "./presets.js";
import type { AltairEditorWorkspace as EditorSession } from "@haneoka/altair/documents";
import { useEditorTranslator } from "@haneoka/altair-ui-react";
import { NumberInput } from "@haneoka/altair-ui-react";
const GROUPS = [
  {
    label: "Color adjustment",
    fields: [
      ["brightness", "Brightness", 1, 0.05],
      ["contrast", "Contrast", 1, 0.05],
      ["saturation", "Saturation", 1, 0.05],
      ["gamma", "Gamma", 1, 0.05],
      ["colorRed", "Red", 255, 1],
      ["colorGreen", "Green", 255, 1],
      ["colorBlue", "Blue", 255, 1],
    ],
  },
  {
    label: "Edge light",
    fields: [
      ["bevel", "Intensity", 0, 0.05],
      ["bevelThickness", "Thickness", 0, 0.5],
      ["bevelRotation", "Angle", 0, 1],
      ["bevelSoftness", "Softness", 0, 0.05],
      ["bevelRed", "Red", 255, 1],
      ["bevelGreen", "Green", 255, 1],
      ["bevelBlue", "Blue", 255, 1],
    ],
  },
  {
    label: "Bloom",
    fields: [
      ["bloom", "Intensity", 0, 0.05],
      ["bloomBrightness", "Brightness", 1, 0.05],
      ["bloomBlur", "Blur", 0, 0.5],
      ["bloomThreshold", "Threshold", 0, 0.05],
    ],
  },
  {
    label: "Blur and masks",
    fields: [
      ["blur", "Blur", 0, 0.5],
      ["shockwaveFilter", "Shockwave time", 0, 0.05],
      ["radiusAlphaFilter", "Mask radius", 0, 0.05],
    ],
  },
] as const;
const SWITCHES = [
  ["oldFilm", "Old film"],
  ["dotFilm", "Halftone"],
  ["reflectionFilm", "Reflection"],
  ["glitchFilm", "Glitch"],
  ["rgbFilm", "RGB split"],
  ["godrayFilm", "Light rays"],
] as const;
const KEYS = new Set<string>([
  ...GROUPS.flatMap((group) => group.fields.map((field) => field[0])),
  ...SWITCHES.map((field) => field[0]),
]);
const DEFAULTS: JsonObject = Object.fromEntries([
  ...GROUPS.flatMap((group) => group.fields.map(([key, , value]) => [key, value] as const)),
  ...SWITCHES.map(([key]) => [key, 0] as const),
]);
const pick = (value: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(value).filter(([key]) => KEYS.has(key)));
export function VisualFilters({
  session,
  value,
  onChange,
}: {
  session: EditorSession;
  value: JsonObject;
  onChange: (value: JsonObject) => void;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const tr = useEditorTranslator();
  const [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [issue, setIssue] = useState("");
  const document = state.documents.find((doc) => doc.path === PRESETS_PATH);
  let library: PresetLibrary = {
      format: "filterPresets",
      version: 1,
      presets: [],
    },
    parseIssue = "";
  try {
    if (document) library = parse(document.text);
  } catch (error) {
    parseIssue = String(error);
  }
  const save = async (next: PresetLibrary) => {
    try {
      const text = serializeAuthoredText(next, document?.text);
      if (document) {
        session.update(PRESETS_PATH, text);
        await session.save();
      } else await session.addFile(PRESETS_PATH, new Blob([text], { type: "application/yaml" }), { open: false });
      setIssue("");
    } catch (error) {
      setIssue(String(error));
    }
  };
  const preset = library.presets.find((preset) => preset.id === selected);
  const apply = (parameters: JsonObject) =>
    onChange({
      ...Object.fromEntries(Object.entries(value).filter(([key]) => !KEYS.has(key))),
      ...DEFAULTS,
      ...pick(parameters),
    });
  return (
    <section className="visual-filter-editor">
      <details open>
        <summary>{tr("Visual filters")}</summary>
        <div className="visual-filter-switches">
          {SWITCHES.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={Boolean(value[key])}
                onChange={(event) => onChange({ ...value, [key]: event.target.checked ? 1 : 0 })}
              />
              {tr(label)}
            </label>
          ))}
        </div>
        {GROUPS.map((group) => (
          <details key={group.label}>
            <summary>{tr(group.label)}</summary>
            <div className="visual-filter-grid">
              {group.fields.map(([key, label, fallback, step]) => (
                <label key={key}>
                  <span>{tr(label)}</span>
                  <NumberInput
                    step={step}
                    aria-label={`${tr(group.label)} · ${tr(label)}`}
                    value={typeof value[key] === "number" ? (value[key] as number) : fallback}
                    onCommit={(next) => onChange({ ...value, [key]: next })}
                  />
                </label>
              ))}
            </div>
          </details>
        ))}
        <button className="secondary-button" onClick={() => apply({})}>
          <RotateCcw size={13} />
          {tr("Reset filters")}
        </button>
      </details>
      <details>
        <summary>{tr("Filter presets")}</summary>
        <select aria-label={tr("Filter preset")} value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">{tr("Choose a preset")}</option>
          {library.presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <div className="visual-preset-actions">
          <button
            className="secondary-button"
            disabled={!preset || Boolean(parseIssue)}
            onClick={() => preset && apply(preset.values)}
          >
            {tr("Apply preset")}
          </button>
          <button
            className="icon-button"
            disabled={!preset || Boolean(parseIssue)}
            aria-label={tr("Delete preset")}
            onClick={() => {
              void save({
                ...library,
                presets: library.presets.filter((item) => item.id !== selected),
              });
              setSelected("");
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <input
          aria-label={tr("Preset name")}
          placeholder={tr("Preset name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="secondary-button"
          disabled={!name.trim() || Boolean(parseIssue)}
          onClick={() => {
            const id = crypto.randomUUID();
            void save({
              ...library,
              presets: [...library.presets, { id, name: name.trim(), values: pick(value) }],
            });
            setSelected(id);
            setName("");
          }}
        >
          <Save size={13} />
          {tr("Save as preset")}
        </button>
        <div className="visual-preset-actions">
          <label
            className="secondary-button"
            tabIndex={0}
            role="button"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.currentTarget.querySelector<HTMLInputElement>("input")?.click();
              }
            }}
          >
            <Upload size={13} />
            {tr("Import presets")}
            <input
              hidden
              type="file"
              accept=".yaml,.yml,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void file
                    .text()
                    .then((text) => {
                      const imported = parse(text, true),
                        ids = new Set(library.presets.map((preset) => preset.id));
                      return save({
                        ...library,
                        presets: [
                          ...library.presets,
                          ...imported.presets.map((preset) => ({
                            ...preset,
                            id: ids.has(preset.id) ? crypto.randomUUID() : preset.id,
                          })),
                        ],
                      });
                    })
                    .catch((error) => setIssue(String(error)));
                event.target.value = "";
              }}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => {
              const url = URL.createObjectURL(
                  new Blob([serializeAuthoredText(library)], {
                    type: "application/yaml",
                  }),
                ),
                link = globalThis.document.createElement("a");
              link.href = url;
              link.download = "filters.yaml";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={13} />
            {tr("Export presets")}
          </button>
        </div>
      </details>
      {(issue || parseIssue) && <p role="alert">{issue || parseIssue}</p>}
    </section>
  );
}
