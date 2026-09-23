import { parseAuthoredText, type JsonObject } from "@haneoka/altair/documents";
export const FILTER_PRESETS_PATH = "library/filters.yaml";
interface Preset {
  id: string;
  name: string;
  values: JsonObject;
  [key: string]: unknown;
}
export interface PresetLibrary {
  format: "filterPresets";
  version: 1;
  presets: Preset[];
  [key: string]: unknown;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function parseFilterPresets(source: string, allowImport = false): PresetLibrary {
  let value: unknown = parseAuthoredText(source);
  if (allowImport && value && typeof value === "object" && !("format" in value)) {
    const presets = Array.isArray(value)
      ? value.map((entry) => ({ ...entry, id: crypto.randomUUID() }))
      : Object.entries(value).map(([name, values]) => ({ id: crypto.randomUUID(), name, values }));
    value = { format: "filterPresets", version: 1, presets };
  }
  if (!record(value) || value.format !== "filterPresets" || value.version !== 1 || !Array.isArray(value.presets))
    throw Error("Invalid filter preset library");
  const ids = new Set<string>();
  for (const preset of value.presets) {
    if (
      !record(preset) ||
      typeof preset.id !== "string" ||
      !preset.id ||
      ids.has(preset.id) ||
      typeof preset.name !== "string" ||
      !preset.name.trim() ||
      !record(preset.values) ||
      Object.values(preset.values).some((number) => typeof number !== "number" || !Number.isFinite(number))
    )
      throw Error("Invalid filter preset library");
    ids.add(preset.id);
  }
  return value as unknown as PresetLibrary;
}
