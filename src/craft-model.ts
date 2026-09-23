import type { AltairSourceFile } from "@haneoka/altair/protocol";
import type { JsonObject } from "@haneoka/altair/model";

export interface WebGalCraftEngineRef {
  readonly id: string;
  readonly version?: string;
}
export interface WebGalCraftProjectConfig {
  readonly version: 1;
  readonly engine?: WebGalCraftEngineRef;
  readonly template?:
    | { readonly kind: "standalone"; readonly name: string }
    | { readonly kind: "engineBuiltin"; readonly engine: WebGalCraftEngineRef };
  readonly [key: string]: unknown;
}
export interface WebGalCraftLayers {
  readonly project: readonly AltairSourceFile[];
  readonly engine?: readonly AltairSourceFile[];
  readonly template?: readonly AltairSourceFile[];
}
export interface WebGalCraftMaterializedWorkspace {
  readonly config: WebGalCraftProjectConfig;
  readonly files: readonly AltairSourceFile[];
  readonly sources: ReadonlyMap<string, "upper" | "engineLower" | "templateLower">;
  readonly missingDependencies: readonly ("engine" | "template")[];
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const name = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value;
};
const engineRef = (value: unknown): WebGalCraftEngineRef => {
  const entry = record(value);
  if (!entry) throw new TypeError("Invalid engine binding");
  return {
    ...entry,
    id: name(entry.id, "Engine id"),
    ...(entry.version === undefined ? {} : { version: name(entry.version, "Engine version") }),
  };
};
export function parseWebGalCraftProject(input: string | Uint8Array | unknown): WebGalCraftProjectConfig {
  const data =
    typeof input === "string"
      ? JSON.parse(input)
      : input instanceof Uint8Array
        ? JSON.parse(new TextDecoder().decode(input))
        : input;
  const value = record(data);
  if (!value || value.version !== 1) throw new TypeError("Unsupported project.wgcp version");
  const engine = value.engine === undefined ? undefined : engineRef(value.engine);
  let template: WebGalCraftProjectConfig["template"];
  if (value.template !== undefined) {
    const item = record(value.template);
    if (!engine || !item) throw new TypeError("A template requires an engine binding");
    if (item.kind === "standalone") template = { ...item, kind: "standalone", name: name(item.name, "Template name") };
    else if (item.kind === "engineBuiltin")
      template = { ...item, kind: "engineBuiltin", engine: engineRef(item.engine) };
    else throw new TypeError("Invalid template binding");
  }
  return { ...value, version: 1, ...(engine ? { engine } : {}), ...(template ? { template } : {}) };
}
export function serializeWebGalCraftProject(config: WebGalCraftProjectConfig): string {
  return JSON.stringify(parseWebGalCraftProject(config), null, 2) + "\n";
}
export function normalizeWebGalCraftPath(path: string): string {
  const value = path.replaceAll("\\", "/");
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\0") ||
    value.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))
  )
    throw new TypeError(`Invalid workspace path: ${path}`);
  return value;
}
export const webGalCraftPathCategory = (path: string): "runtime" | "override" | "template" | "game" | "other" => {
  const parts = path.split("/");
  if (["index.html", "assets", "manifest.json", "webgal-serviceworker.js"].includes(parts[0]!)) return "runtime";
  if (parts[0] === "icons") return "override";
  if (parts[0] === "game") return parts[1] === "template" ? "template" : "game";
  return "other";
};
const indexFiles = (files: readonly AltairSourceFile[]): Map<string, AltairSourceFile> => {
  const result = new Map<string, AltairSourceFile>();
  for (const file of files) {
    const path = normalizeWebGalCraftPath(file.path);
    if (result.has(path)) throw new TypeError(`Duplicate workspace file: ${path}`);
    result.set(path, { ...file, path });
  }
  return result;
};
export function materializeWebGalCraftWorkspace(layers: WebGalCraftLayers): WebGalCraftMaterializedWorkspace {
  const upper = indexFiles(layers.project),
    engine = indexFiles(layers.engine ?? []),
    template = indexFiles(layers.template ?? []);
  const descriptor = upper.get("project.wgcp");
  const config = descriptor ? parseWebGalCraftProject(descriptor.bytes) : { version: 1 as const };
  const sources = new Map<string, "upper" | "engineLower" | "templateLower">();
  const files: AltairSourceFile[] = [];
  const whiteoutPrefix = ".webgalcraft/vfs/whiteouts/";
  const removed = new Set<string>();
  for (const path of upper.keys()) {
    if (!path.startsWith(whiteoutPrefix)) continue;
    const entry = path.slice(whiteoutPrefix.length),
      parts = entry.split("/"),
      leaf = parts.pop()!;
    if (leaf.startsWith(".wh.")) removed.add([...parts, leaf.slice(4)].join("/"));
  }
  const deleted = (path: string) => [...removed].some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  const candidates = new Set([
    ...upper.keys(),
    ...engine.keys(),
    ...[...template.keys()].map((path) => "game/template/" + path),
  ]);
  const templateLayer =
    layers.template !== undefined
      ? template
      : config.template?.kind === "engineBuiltin"
        ? new Map([...engine].filter(([p]) => p.startsWith("game/template/")).map(([p, f]) => [p.slice(14), f]))
        : new Map<string, AltairSourceFile>();
  const insert = (
    file: AltairSourceFile | undefined,
    path: string,
    source: "upper" | "engineLower" | "templateLower",
  ) => {
    if (file) {
      files.push({ ...file, path });
      sources.set(path, source);
      return true;
    }
    return false;
  };
  for (const path of [...candidates].sort()) {
    if (path === "project.wgcp" || path.startsWith(".webgalcraft/")) continue;
    const category = webGalCraftPathCategory(path);
    const prefersUpper =
      category === "override" || category === "template" || category === "game" || layers.engine === undefined;
    if (prefersUpper && insert(upper.get(path), path, "upper")) continue;
    if ((category === "template" || category === "game") && deleted(path)) continue;
    if (category === "template") {
      if (insert(templateLayer.get(path.slice(14)), path, "templateLower")) continue;
    } else if (category !== "game" && insert(engine.get(path), path, "engineLower")) continue;
    if (category === "runtime" && layers.engine !== undefined) continue;
    insert(upper.get(path), path, "upper");
  }
  const missingDependencies: Array<"engine" | "template"> = [];
  if (config.engine && layers.engine === undefined) missingDependencies.push("engine");
  if (config.template?.kind === "standalone" && layers.template === undefined) missingDependencies.push("template");
  return { config, files, sources, missingDependencies };
}

export interface WebGalCraftStatementGroup {
  readonly id: string;
  readonly name: string;
  readonly rawTexts: readonly string[];
  readonly createdAt: number;
}
export interface WebGalCraftCommandLibrary {
  readonly defaults: Readonly<Record<string, string>>;
  readonly groups: readonly WebGalCraftStatementGroup[];
  readonly favoriteCommandIds: readonly string[];
  readonly activeCategory: string;
}
export function parseWebGalCraftCommandLibrary(input: unknown): WebGalCraftCommandLibrary {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const object = record(data);
  if (!object) throw new TypeError("Invalid command library");
  const defaults: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(record(object.defaults) ?? {}))
    defaults[key] = name(value, "Default statement");
  const groups: WebGalCraftStatementGroup[] = [];
  const ids = new Set<string>();
  if (object.groups !== undefined && !Array.isArray(object.groups)) throw new TypeError("Invalid statement groups");
  for (const item of (object.groups ?? []) as unknown[]) {
    const group = record(item);
    if (!group) throw new TypeError("Invalid statement group");
    const id = name(group.id, "Group id");
    if (ids.has(id)) throw new TypeError(`Duplicate statement group: ${id}`);
    ids.add(id);
    if (!Array.isArray(group.rawTexts) || group.rawTexts.some((text) => typeof text !== "string"))
      throw new TypeError("Group statements must be strings");
    groups.push({
      id,
      name: name(group.name, "Group name"),
      rawTexts: [...group.rawTexts] as string[],
      createdAt: typeof group.createdAt === "number" && Number.isFinite(group.createdAt) ? group.createdAt : 0,
    });
  }
  const favorites = object.favoriteCommandIds ?? [];
  if (!Array.isArray(favorites) || favorites.some((v) => typeof v !== "string"))
    throw new TypeError("Invalid favorites");
  return {
    defaults,
    groups,
    favoriteCommandIds: [...new Set(favorites)] as string[],
    activeCategory: typeof object.activeCategory === "string" ? object.activeCategory : "all",
  };
}
export const webGalCraftConfigExtension = (config: WebGalCraftProjectConfig): JsonObject =>
  JSON.parse(serializeWebGalCraftProject(config)) as JsonObject;
