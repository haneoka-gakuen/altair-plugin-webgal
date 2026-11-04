import {
  cloneStoryValue,
  cloneAltairNodeGroup,
  AltairDocumentRegistry,
  parseAltairSceneDocument,
  serializeAltairDocument,
  type AltairAuthoredWorkspace,
  type AltairAuthoredNode,
  type AltairSceneDocument,
} from "@haneoka/altair/documents";
import type { JsonObject, JsonValue, StoryProject, StoryProjectCommand } from "@haneoka/altair/model";
import { ADV_COMMAND, commandDescriptor, replaceStoryCommandFieldValue } from "@haneoka/altair-plugin-adv/commands";
import { registerAdvDocumentCommands } from "@haneoka/altair-plugin-adv/documents";
import { VEGA_COMMAND_GROUP_OPCODE } from "@haneoka/vega-protocol";
import { webGalCommandToAuthoredNode, registerWebGalDocumentCommands } from "./documents.js";
import { canonicalJson, createWebGalSceneDraft, mergeWebGalScene, type WebGalSceneEditContext } from "./webgal.js";

import { NATIVE_STATEMENT_NAMES, parseNativeStatement, serializeNativeStatement } from "./native-statements.js";
export { nativeScriptLanguage } from "./native-statements.js";

interface NativeScriptUnit {
  id: string;
  rootId: string;
  primaryId?: string;
  command: StoryProjectCommand;
}
export interface NativeScriptMap {
  format: "altair-native-script";
  version: 1;
  dialect?: 2;
  scene: AltairSceneDocument;
  localeIndex: number;
  context: WebGalSceneEditContext;
  units: NativeScriptUnit[];
  performances: Record<string, StoryProjectCommand>;
  performanceNodes: Record<string, string>;
  reservedPerformances?: string[];
}
export interface NativeScriptDraft {
  text: string;
  map: NativeScriptMap;
}
export const NATIVE_SCRIPT_STATE = "haneoka.authoring.script";
export const NATIVE_SCRIPT_FILES = "haneoka.authoring.files";
export interface NativeScriptState {
  text: string;
  map: NativeScriptMap;
}
export interface NativeScriptReference extends JsonObject {
  sceneId: string;
  source: string;
  map: string;
}
const record = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
export function parseNativeScriptMap(value: unknown): NativeScriptMap {
  const map = value as NativeScriptMap;
  if (
    !map ||
    map.format !== "altair-native-script" ||
    map.version !== 1 ||
    !Number.isInteger(map.localeIndex) ||
    map.localeIndex < 0 ||
    map.localeIndex > 4 ||
    !Array.isArray(map.units) ||
    typeof map.context?.baselineText !== "string" ||
    map.context.sceneId !== map.scene?.id
  )
    throw new Error("Invalid native script map");
  parseAltairSceneDocument(map.scene);
  return map;
}
export function nativeScriptState(scene: AltairSceneDocument): NativeScriptState | undefined {
  const value = scene.extensions?.[NATIVE_SCRIPT_STATE];
  if (value === undefined) return;
  const state = record(value);
  if (typeof state.text !== "string") throw new Error("Invalid native script source");
  return { text: state.text, map: parseNativeScriptMap(state.map) };
}
export function cleanNativeScriptScene(scene: AltairSceneDocument): AltairSceneDocument {
  if (!Object.hasOwn(scene.extensions ?? {}, NATIVE_SCRIPT_STATE)) return scene;
  const { [NATIVE_SCRIPT_STATE]: _, ...extensions } = scene.extensions ?? {};
  return { ...scene, extensions };
}
export function nativeScriptReferences(project: AltairAuthoredWorkspace["project"]): NativeScriptReference[] {
  const value = project.extensions?.[NATIVE_SCRIPT_FILES];
  if (value === undefined) return [];
  const declared = record(value);
  if (declared.version !== 1 || !Array.isArray(declared.scenes)) throw new Error("Unsupported native script file map");
  return declared.scenes.map((value) => {
    const reference = record(value);
    if (
      typeof reference.sceneId !== "string" ||
      typeof reference.source !== "string" ||
      typeof reference.map !== "string"
    )
      throw new Error("Invalid native script file reference");
    return { sceneId: reference.sceneId, source: reference.source, map: reference.map };
  });
}
export function nativeScriptRegistry(): AltairDocumentRegistry {
  const registry = new AltairDocumentRegistry();
  registerAdvDocumentCommands(registry);
  registerWebGalDocumentCommands(registry);
  return registry;
}
export function withNativeScriptProviders(workspace: AltairAuthoredWorkspace): AltairAuthoredWorkspace {
  const plugins = [...workspace.project.plugins];
  const required = new Set<string>();
  const visit = (node: AltairAuthoredNode) => {
    required.add(node.type.plugin);
    node.children?.forEach(visit);
  };
  workspace.scenes.forEach((scene) => scene.nodes.forEach(visit));
  for (const id of ["haneoka.altair-adv", "haneoka.altair-webgal"]) {
    if (required.has(id) && !plugins.some((plugin) => plugin.id === id))
      plugins.push({
        id,
        version: "0.1.0",
        permissions: id === "haneoka.altair-webgal" ? ["project.read", "project.write"] : [],
      });
  }
  return { ...workspace, project: { ...workspace.project, plugins } };
}
export function resolveNativeScriptWorkspace(
  workspace: AltairAuthoredWorkspace,
  files: ReadonlyMap<string, string> = new Map(),
): AltairAuthoredWorkspace {
  const declared = nativeScriptReferences(workspace.project);
  const references = new Map(declared.map((reference) => [reference.sceneId, reference]));
  if (
    references.size !== declared.length ||
    declared.some((reference) => !workspace.scenes.some((scene) => scene.id === reference.sceneId))
  )
    throw new Error("Invalid native script scene reference");
  const states = new Map<string, NativeScriptState>();
  for (const scene of workspace.scenes) {
    const reference = references.get(scene.id);
    if (reference) {
      const text = files.get(reference.source),
        metadata = files.get(reference.map);
      if (text === undefined || metadata === undefined) throw new Error("Native script source or map is missing");
      states.set(scene.id, { text, map: parseNativeScriptMap(JSON.parse(metadata)) });
    } else {
      const state = nativeScriptState(scene);
      if (state) states.set(scene.id, state);
    }
  }
  const { [NATIVE_SCRIPT_FILES]: _, ...extensions } = workspace.project.extensions ?? {};
  const clean = withNativeScriptProviders({
    project: { ...workspace.project, extensions },
    scenes: workspace.scenes.map(cleanNativeScriptScene),
  });
  if (!states.size) return clean;
  const project = nativeScriptRegistry().compileDraft(clean);
  return withNativeScriptProviders({
    ...clean,
    scenes: clean.scenes.map((scene) => {
      const state = states.get(scene.id);
      return state ? applyNativeScript(project, scene, state.map, state.text) : scene;
    }),
  });
}
const locales = ["ja", "en", "zh-TW", "zh-CN", "ko"];
const localized = (value: JsonValue | undefined, index: number): string => {
  if (typeof value === "string") return value;
  const values = Array.isArray(value) ? value : Object.values(record(value));
  const preferred = Array.isArray(value) ? value[index] : record(value)[locales[index]!];
  return typeof preferred === "string" && preferred
    ? preferred
    : String(values.find((value) => typeof value === "string" && value) ?? "");
};
function atoms(command: StoryProjectCommand): StoryProjectCommand[] {
  if (command.command !== VEGA_COMMAND_GROUP_OPCODE) return [command];
  const actions = record(command.fields.commandGroup).actions;
  if (!Array.isArray(actions)) return [command];
  return actions.flatMap((value, index) => {
    const raw = record(record(value).command);
    const { command: opcode, commandId, ...fields } = raw;
    if (typeof opcode !== "number" && typeof opcode !== "string") return [];
    return atoms({
      id: typeof commandId === "string" ? commandId : `${command.id}/action/${index}`,
      command: opcode,
      fields,
      extensions: {},
    });
  });
}
function authorCommand(command: StoryProjectCommand): StoryProjectCommand {
  const result = cloneStoryValue(command);
  if (typeof result.fields.key === "string" && result.fields.key.startsWith("altair/")) delete result.fields.key;
  delete result.source;
  delete result.extensions.webgalOriginalFields;
  return result;
}
function shadow(project: StoryProject, scene: AltairSceneDocument, units: readonly NativeScriptUnit[]): StoryProject {
  return {
    ...project,
    scenes: project.scenes.map((candidate) =>
      candidate.id === scene.id
        ? { id: scene.id, name: scene.name, commands: units.map((unit) => unit.command), extensions: {} }
        : candidate,
    ),
  };
}
function unitsFor(project: StoryProject, scene: AltairSceneDocument, compact = false): NativeScriptUnit[] {
  const compiled = project.scenes.find((candidate) => candidate.id === scene.id);
  if (!compiled) throw new Error(`Scene is missing: ${scene.id}`);
  return scene.nodes.flatMap((node): NativeScriptUnit[] => {
    const commands = compiled.commands.filter(
      (command) => record(command.extensions.altairNode).nodeId === node.id || command.id === node.id,
    );
    const dialogue = commands.flatMap(atoms).filter((command) => command.command === ADV_COMMAND.Talk);
    if (dialogue.length)
      return dialogue.map((command) => ({
        id: command.id,
        rootId: node.id,
        primaryId: command.id,
        command: authorCommand(command),
      }));
    const command = commands[0];
    if (
      compact &&
      command &&
      commands.length === 1 &&
      !node.children?.length &&
      serializeNativeStatement(command) !== undefined
    ) {
      const projected = authorCommand(command);
      for (const field of commandDescriptor(command.command)?.fields ?? [])
        if (Object.hasOwn(node.arguments, field.key))
          projected.fields = replaceStoryCommandFieldValue(projected.fields, field, node.arguments[field.key]);
      return [{ id: node.id, rootId: node.id, command: { ...projected, id: node.id } }];
    }
    return command
      ? [
          {
            id: node.id,
            rootId: node.id,
            command: { id: node.id, command: "haneoka.altair-authoring:performance@1", fields: {}, extensions: {} },
          },
        ]
      : [];
  });
}
/** The editable text owns expressible values; the map owns identities and native performance data. */
export function createNativeScriptDraft(
  project: StoryProject,
  scene: AltairSceneDocument,
  localeIndex = 0,
  previous?: NativeScriptMap,
): NativeScriptDraft {
  scene = cleanNativeScriptScene(scene);
  const compact = !previous || previous.dialect === 2;
  const units = unitsFor(project, scene, compact);
  const references: Record<string, string> = {},
    performances: Record<string, StoryProjectCommand> = {},
    performanceNodes: Record<string, string> = {};
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const reserved = new Set(previous?.reservedPerformances ?? Object.keys(previous?.performances ?? {}));
  const named = new Map(Object.entries(previous?.performanceNodes ?? {}).map(([name, id]) => [id, name]));
  const compiled = project.scenes.find((candidate) => candidate.id === scene.id)!;
  for (const unit of units) {
    if (unit.primaryId || (compact && serializeNativeStatement(unit.command) !== undefined)) continue;
    const node = nodes.get(unit.rootId)!;
    const fields = compiled.commands.find((command) => command.id === unit.rootId)?.fields ?? {};
    const target = localized(fields.targetTextNames, localeIndex) || String(fields.targetName ?? "");
    const source = String(
      fields.backgroundRef ?? fields.live2dKey ?? fields.bgmRef ?? fields.seRef ?? fields.motionName ?? "",
    );
    const resource =
      source
        .split(/[\\/:]/u)
        .filter(Boolean)
        .at(-1) ?? "";
    const internalTarget = /^chara_|^figure\d/u.test(target) ? "" : target;
    const base = [
      node.type.name === "timeline" ? (node.children?.[0]?.type.name ?? "Performance") : node.type.name,
      internalTarget,
      resource,
    ]
      .filter(Boolean)
      .join("_")
      .replace(/[;\r\n]/gu, "_");
    let name = named.get(unit.rootId) ?? (base || "Performance"),
      suffix = 2;
    if (!named.has(unit.rootId)) while (reserved.has(name)) name = `${base}_${suffix++}`;
    reserved.add(name);
    references[unit.id] = name;
    const command = { ...unit.command, fields: { ...unit.command.fields, nativePerformance: name } };
    unit.command = command;
    performances[name] = cloneStoryValue(command);
    performanceNodes[name] = node.id;
  }
  const draft = createWebGalSceneDraft(shadow(project, scene, units), {
    sceneId: scene.id,
    localeIndex,
    preserveUnchangedSource: false,
    performanceReferences: references,
    ...(compact ? { commandText: serializeNativeStatement } : {}),
  });
  return {
    text: draft.text,
    map: {
      format: "altair-native-script",
      version: 1,
      ...(compact ? { dialect: 2 as const } : {}),
      scene: cloneStoryValue(scene),
      localeIndex,
      context: draft.context,
      units,
      performances,
      performanceNodes,
      reservedPerformances: [...reserved],
    },
  };
}
export function rebaseNativeScriptDraft(
  project: StoryProject,
  scene: AltairSceneDocument,
  previous?: NativeScriptState,
  localeIndex = 0,
): NativeScriptDraft {
  const draft = createNativeScriptDraft(project, scene, previous?.map.localeIndex ?? localeIndex, previous?.map);
  if (!previous) return draft;
  const units = unitsFor(project, scene, draft.map.dialect === 2);
  const references: Record<string, string> = {};
  for (const unit of units)
    if (!unit.primaryId) {
      const alias = Object.entries(draft.map.performanceNodes).find(([, id]) => id === unit.rootId)?.[0];
      if (alias) {
        unit.command.fields.nativePerformance = alias;
        references[unit.id] = alias;
      }
    }
  const merged = mergeWebGalScene(shadow(project, scene, units), previous.text, {
    directAssetPaths: true,
    ...(previous.map.dialect === 2
      ? { additionalCommandNames: NATIVE_STATEMENT_NAMES, statementCommand: parseNativeStatement }
      : {}),
    sceneId: scene.id,
    localeIndex: draft.map.localeIndex,
    baselineContext: previous.map.context,
    nativePerformances: { ...previous.map.performances, ...draft.map.performances },
  });
  const next = createWebGalSceneDraft(merged.project, {
    sceneId: scene.id,
    localeIndex: draft.map.localeIndex,
    performanceReferences: references,
    ...(draft.map.dialect === 2 ? { commandText: serializeNativeStatement } : {}),
  });
  return { ...draft, text: next.text };
}
/** Plain scripts are the portable authoring surface; maps retain native IDs and performance data. */
export function nativeScriptWorkspaceFiles(
  workspace: AltairAuthoredWorkspace,
  localeIndex = 0,
  originals: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const scenes = workspace.scenes.map(cleanNativeScriptScene);
  const { [NATIVE_SCRIPT_FILES]: _, ...extensions } = workspace.project.extensions ?? {};
  const clean = withNativeScriptProviders({ project: { ...workspace.project, extensions }, scenes });
  const compiled = nativeScriptRegistry().compileDraft(clean);
  const files = new Map<string, string>(),
    references: NativeScriptReference[] = [];
  const paths = workspace.project.scenes.map((reference, index) => {
    const scene = scenes.find((scene) => scene.id === reference.id)!;
    const key = `${String(index + 1).padStart(3, "0")}-${scene.id.replace(/[^\p{L}\p{N}_-]/gu, "_")}`;
    const path = `.altair/scenes/${key}.scene.yaml`;
    const source = `scenes/${key}.txt`,
      map = `.altair/scenes/${key}.script.json`;
    const draft =
      nativeScriptState(workspace.scenes.find((scene) => scene.id === reference.id)!) ??
      createNativeScriptDraft(compiled, scene, localeIndex);
    files.set(path, serializeAltairDocument(scene, originals.get(reference.path)));
    files.set(source, draft.text);
    files.set(map, JSON.stringify(canonicalJson(draft.map as unknown as JsonValue)));
    references.push({ sceneId: scene.id, source, map });
    return { ...reference, path };
  });
  files.set(
    "project.yaml",
    serializeAltairDocument(
      {
        ...clean.project,
        scenes: paths,
        extensions: { ...extensions, [NATIVE_SCRIPT_FILES]: { version: 1, scenes: references } },
      },
      originals.get("project.yaml"),
    ),
  );
  return files;
}
function deltaObject(original: JsonObject, before: JsonObject, after: JsonObject): JsonObject {
  const result = { ...original };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (equal(before[key], after[key])) continue;
    if (Object.hasOwn(after, key)) result[key] = cloneStoryValue(after[key]!);
    else delete result[key];
  }
  return result;
}
function patchNode(
  node: AltairAuthoredNode,
  before: StoryProjectCommand,
  after: StoryProjectCommand,
): AltairAuthoredNode {
  if (equal(before.fields, after.fields) && before.command === after.command) return node;
  const oldValue = webGalCommandToAuthoredNode(before),
    nextValue = webGalCommandToAuthoredNode(after);
  if (!equal(oldValue.type, nextValue.type)) return { ...nextValue, id: node.id };
  const extensions = { ...node.extensions };
  const fields = deltaObject(
    record(extensions.fields),
    record(oldValue.extensions?.fields),
    record(nextValue.extensions?.fields),
  );
  if (Object.keys(fields).length || Object.hasOwn(extensions, "fields")) extensions.fields = fields;
  return { ...node, arguments: deltaObject(node.arguments, oldValue.arguments, nextValue.arguments), extensions };
}
function rebindSpeaker(
  project: StoryProject,
  before: StoryProjectCommand,
  after: StoryProjectCommand,
  locale: number,
): StoryProjectCommand {
  if (after.command !== ADV_COMMAND.Talk || equal(before.fields.targetTextNames, after.fields.targetTextNames))
    return after;
  const names = Array.isArray(after.fields.targetTextNames)
    ? after.fields.targetTextNames.map((value) => localized(value, locale))
    : [];
  const bindings = new Map<string, JsonObject | null>();
  for (const scene of project.scenes)
    for (const command of scene.commands.flatMap(atoms)) {
      if (command.command !== ADV_COMMAND.Talk || !Array.isArray(command.fields.targets)) continue;
      const labels = Array.isArray(command.fields.targetTextNames) ? command.fields.targetTextNames : [];
      command.fields.targets.forEach((value, index) => {
        const target = record(value),
          name = localized(labels[index], locale) || localized(target.name, locale);
        if (!name || typeof target.target !== "string") return;
        const existing = bindings.get(name);
        bindings.set(name, existing === null || (existing && existing.target !== target.target) ? null : target);
      });
    }
  if (names.some((name) => !bindings.get(name))) return after;
  const targets = names.map((name) => cloneStoryValue(bindings.get(name)!));
  return {
    ...after,
    fields: {
      ...after.fields,
      targetName: targets[0]?.target ?? "",
      targets,
      lipSyncTargets: targets.map((target) => target.target!),
    },
  };
}
function rewriteTree(
  node: AltairAuthoredNode,
  edits: ReadonlyMap<string, { before: StoryProjectCommand; after: StoryProjectCommand }>,
  removed: ReadonlySet<string>,
): AltairAuthoredNode | undefined {
  if (removed.has(node.id)) return;
  const edit = edits.get(node.id);
  let next = edit ? patchNode(node, edit.before, edit.after) : node;
  if (next.children) {
    const children = next.children.flatMap((child) => {
      const value = rewriteTree(child, edits, removed);
      return value ? [value] : [];
    });
    if (!equal(children, next.children)) {
      const ids = new Set(children.map((child) => child.id));
      const tracks = next.arguments.tracks;
      next = {
        ...next,
        children,
        arguments: {
          ...next.arguments,
          ...(Array.isArray(tracks) ? { tracks: tracks.filter((track) => ids.has(String(record(track).nodeId))) } : {}),
        },
      };
    }
  }
  return next;
}
export function assertNativeScriptLocks(before: AltairSceneDocument, after: AltairSceneDocument): void {
  const flatten = (node: AltairAuthoredNode): AltairAuthoredNode[] => [node, ...(node.children ?? []).flatMap(flatten)];
  const fields: Record<string, readonly string[]> = {
    text: ["text"],
    cast: ["targetName", "targetTextNames", "live2dKey", "targets", "lipSyncTargets"],
    motion: ["motionName", "motionFadeIn"],
    face: ["expressionName", "expressionFadeIn"],
    camera: ["cameraX", "cameraY", "cameraZ", "focusTarget", "focusPosition", "zoom", "dof"],
    audio: ["voiceRefs", "voices", "bgmRef", "seRef", "audioRef", "volume"],
    stage: ["backgroundRef", "stillRef", "positionType", "characterWorldPosition", "characterWorldTransition"],
    timing: ["tracks", "duration", "durationSeconds", "waitForPrevious", "cancelOnManualAdvance"],
  };
  const values = (node: AltairAuthoredNode, field: string) =>
    flatten(node)
      .map((value) => {
        const all = { ...record(value.extensions?.fields), ...value.arguments };
        return Object.fromEntries(
          (fields[field] ?? []).filter((key) => Object.hasOwn(all, key)).map((key) => [key, all[key]]),
        );
      })
      .filter((value) => Object.keys(value).length);
  const next = new Map(after.nodes.flatMap(flatten).map((node) => [node.id, node]));
  for (const node of before.nodes.flatMap(flatten)) {
    const locks = record(node.extensions?.["haneoka.authoring.locks"]);
    if (!Object.values(locks).some(Boolean)) continue;
    const current = next.get(node.id);
    if (
      !current ||
      Object.keys(locks).some((field) => locks[field] && !equal(values(node, field), values(current, field)))
    )
      throw new Error("Script changes a locked field");
  }
}
/** Three-way text edits retain native cues, locks, resources and unknown authored fields. */
export function applyNativeScript(
  project: StoryProject,
  current: AltairSceneDocument,
  map: NativeScriptMap,
  text: string,
  onPerformances?: (roots: string[]) => void,
): AltairSceneDocument {
  if (map.format !== "altair-native-script" || map.version !== 1 || map.scene.id !== current.id)
    throw new Error("Script map belongs to another scene");
  if (text === map.context.baselineText) return cloneStoryValue(current);
  const units = unitsFor(project, current, map.dialect === 2);
  for (const unit of units) {
    const baseline = map.units.find((candidate) => candidate.id === unit.id);
    if (baseline && !baseline.primaryId && typeof baseline.command.fields.nativePerformance === "string")
      unit.command.fields.nativePerformance = baseline.command.fields.nativePerformance;
  }
  const result = mergeWebGalScene(shadow(project, current, units), text, {
    directAssetPaths: true,
    ...(map.dialect === 2
      ? { additionalCommandNames: NATIVE_STATEMENT_NAMES, statementCommand: parseNativeStatement }
      : {}),
    sceneId: current.id,
    localeIndex: map.localeIndex,
    baselineContext: map.context,
    nativePerformances: map.performances,
  });
  const edited = result.project.scenes.find((scene) => scene.id === current.id)!;
  const conflicts = record(edited.extensions.webgalLossless);
  if (
    (Array.isArray(conflicts.conflicts) && conflicts.conflicts.length) ||
    (Array.isArray(conflicts.structuralConflicts) && conflicts.structuralConflicts.length)
  )
    throw new Error("Script conflicts with the current scene");
  if (
    result.diagnostics.some(
      (diagnostic) => diagnostic.severity === "error" || diagnostic.code === "webgal.lossless.diffLimit",
    )
  )
    throw new Error("Script cannot be applied without losing native data");
  const baseline = new Map(map.units.map((unit) => [unit.id, unit]));
  const active = new Map(units.map((unit) => [unit.id, unit]));
  onPerformances?.(
    edited.commands
      .filter((command) => typeof command.fields.nativePerformance === "string")
      .map((command) => active.get(command.id)?.rootId ?? baseline.get(command.id)?.rootId ?? command.id),
  );
  const indexes = new Map(edited.commands.map((command, index) => [command.id, index]));
  for (const root of current.nodes) {
    const owned = map.units.filter((unit) => unit.rootId === root.id && indexes.has(unit.id));
    if (owned.length < 2) continue;
    const positions = owned.map((unit) => indexes.get(unit.id)!);
    for (let index = Math.min(...positions); index <= Math.max(...positions); index++)
      if (baseline.get(edited.commands[index]!.id)?.rootId !== root.id)
        throw new Error("Keep a timed performance together when moving its dialogue");
  }
  const editedById = new Map(edited.commands.map((command) => [command.id, command]));
  const changes = new Map<string, { before: StoryProjectCommand; after: StoryProjectCommand }>();
  const removed = new Set<string>();
  for (const unit of map.units)
    if (unit.primaryId) {
      const command = editedById.get(unit.id);
      if (command)
        changes.set(unit.primaryId, {
          before: unit.command,
          after: rebindSpeaker(project, unit.command, command, map.localeIndex),
        });
      else removed.add(unit.primaryId);
    }
  const roots = new Map(current.nodes.map((node) => [node.id, node]));
  const archived: JsonObject[] = [];
  const output: AltairAuthoredNode[] = [],
    emitted = new Set<string>();
  for (const command of edited.commands) {
    const unit = active.get(command.id) ?? baseline.get(command.id);
    if (unit) {
      if (emitted.has(unit.rootId)) continue;
      const root = roots.get(unit.rootId);
      if (!root) throw new Error("The selected line was removed in another edit");
      const performance =
        typeof command.fields.nativePerformance === "string" ? command.fields.nativePerformance : undefined;
      const previous =
        typeof unit.command.fields.nativePerformance === "string" ? unit.command.fields.nativePerformance : undefined;
      if (performance && performance !== previous) {
        const presetId = map.performanceNodes[performance];
        const preset = map.scene.nodes.find((node) => node.id === presetId);
        if (!preset) throw new Error(`Native performance is missing: ${performance}`);
        if (
          !equal(
            root,
            map.scene.nodes.find((node) => node.id === root.id),
          )
        )
          throw new Error("Script conflicts with the current performance");
        const copied = cloneAltairNodeGroup([preset], current.id, current.id)[0]!;
        output.push({ ...copied, id: root.id });
      } else if (!unit.primaryId && !performance) {
        const original = project.scenes
          .find((scene) => scene.id === current.id)!
          .commands.find((value) => value.id === root.id);
        const decoded = webGalCommandToAuthoredNode(command);
        if (original && original.command === command.command && equal(root.type, decoded.type)) {
          const known = authorCommand(original);
          const nextCommand =
            known.fields.key && !command.fields.key
              ? { ...command, fields: { ...command.fields, key: known.fields.key } }
              : command;
          output.push(patchNode(root, known, nextCommand));
        } else {
          archived.push({ id: root.id, node: cloneStoryValue(root) as unknown as JsonObject });
          const { children: _, arguments: __, extensions: ___, ...identity } = root;
          output.push({
            ...identity,
            ...decoded,
            id: root.id,
            extensions: { ...decoded.extensions, "haneoka.authoring.explicit": true },
          });
        }
      } else {
        const updated = rewriteTree(root, changes, removed);
        if (updated) output.push(updated);
      }
      emitted.add(unit.rootId);
      continue;
    }
    const performanceId =
      typeof command.fields.nativePerformance === "string"
        ? map.performanceNodes[command.fields.nativePerformance]
        : undefined;
    const performance = performanceId ? map.scene.nodes.find((node) => node.id === performanceId) : undefined;
    const source = performance ?? webGalCommandToAuthoredNode(command);
    const copied = cloneAltairNodeGroup([source], current.id, current.id)[0]!;
    output.push({
      ...copied,
      id: command.id,
      extensions: { ...copied.extensions, "haneoka.authoring.explicit": true },
    });
  }
  const represented = new Set(map.units.map((unit) => unit.rootId));
  for (const node of current.nodes)
    if (!represented.has(node.id) && !emitted.has(node.id)) {
      const following = current.nodes
        .slice(current.nodes.indexOf(node) + 1)
        .find((candidate) => output.some((value) => value.id === candidate.id));
      const index = following ? output.findIndex((value) => value.id === following.id) : output.length;
      output.splice(index, 0, node);
    }
  const previousArchive = current.extensions?.["haneoka.authoring.replaced"];
  const next = {
    ...current,
    nodes: output,
    ...(archived.length
      ? {
          extensions: {
            ...current.extensions,
            "haneoka.authoring.replaced": [...(Array.isArray(previousArchive) ? previousArchive : []), ...archived],
          },
        }
      : {}),
  };
  assertNativeScriptLocks(current, next);
  return next;
}
