import {
  STORY_PROJECT_VERSION,
  cloneStoryValue,
  type JsonObject,
  type JsonValue,
  type StoryProject,
  type StoryProjectCommand,
  type StoryScene,
} from "@haneoka/altair/model";
import type {
  AltairFormatExportRequest,
  AltairFormatExportResult,
  AltairFormatImportResult,
  AltairFormatRequest,
  AltairSourceFile,
  StoryDiagnostic,
} from "@haneoka/altair/protocol";
import {
  importWebGal,
  normalizeWebGalSceneTarget,
  serializeWebGal,
  type ImportWebGalOptions,
  type WebGalLosslessMetadataScope,
} from "./webgal.js";
import {
  assertValidStoryProject,
  storyDiagnostic,
  stringifyStoryJson,
} from "./support.js";

const encoder = new TextEncoder();

export const WEBGAL_WORKSPACE_LIMITS = Object.freeze({
  files: 16_384,
  sceneFiles: 4_096,
  totalBytes: 2 * 1024 * 1024 * 1024,
  sceneBytes: 16 * 1024 * 1024,
  pathLength: 1_024,
});

const WEBGAL_SCENE_EXTENSION = /\.(?:txt|wg|webgal)$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const URL_OR_DRIVE_PATH = /^(?:[a-z][a-z0-9+.-]*:|[a-z]:[\\/])/iu;

interface NormalizedSourceFile extends AltairSourceFile {
  readonly path: string;
}

interface WebGalSceneSource extends NormalizedSourceFile {
  readonly sceneId: string;
  readonly sceneName: string;
}

interface ImportedSceneSource {
  readonly source: WebGalSceneSource;
  readonly result: AltairFormatImportResult;
  readonly scene: StoryScene;
  readonly originalSceneId: string;
}

const objectValue = (value: JsonValue | undefined): JsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;

const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  throw (
    signal.reason ??
    new DOMException("WebGAL workspace operation aborted", "AbortError")
  );
};

/**
 * Canonical relative paths are shared by import, source maps, and export.
 * Traversal, URL-like paths, platform-specific roots, and aliasing separators
 * are rejected before any source is decoded.
 */
export const normalizeWebGalWorkspacePath = (value: string): string => {
  if (typeof value !== "string") {
    throw new TypeError("WebGAL workspace path must be a string");
  }
  const candidate = value.normalize("NFKC").trim().replaceAll("\\", "/");
  if (!candidate || candidate.length > WEBGAL_WORKSPACE_LIMITS.pathLength) {
    throw new RangeError(
      `WebGAL workspace path must contain 1-${WEBGAL_WORKSPACE_LIMITS.pathLength} characters`,
    );
  }
  if (
    candidate.startsWith("/") ||
    URL_OR_DRIVE_PATH.test(candidate) ||
    CONTROL_CHARACTER.test(candidate) ||
    candidate.includes("?") ||
    candidate.includes("#")
  ) {
    throw new TypeError(`WebGAL workspace path is not relative: ${value}`);
  }
  const parts: string[] = [];
  for (const part of candidate.split("/")) {
    if (part === ".") continue;
    if (
      !part ||
      part === ".." ||
      part.trim() !== part ||
      part.endsWith(".") ||
      part.includes(":")
    ) {
      throw new TypeError(`WebGAL workspace path is not canonical: ${value}`);
    }
    parts.push(part);
  }
  if (!parts.length) {
    throw new TypeError(`WebGAL workspace path is empty: ${value}`);
  }
  return parts.join("/");
};

const stripWebGalExtension = (value: string): string =>
  value.replace(WEBGAL_SCENE_EXTENSION, "");

const safeScenePart = (value: string): string => {
  const safe = value
    .normalize("NFKC")
    .trim()
    .replace(/[^a-zA-Z0-9_.\-\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return !safe || safe === "." || safe === ".." ? "scene" : safe;
};

/** Stable scene identity which keeps folders below WebGAL's `scene` root. */
export const webGalSceneIdForPath = (path: string): string =>
  normalizeWebGalSceneTarget(normalizeWebGalWorkspacePath(path)) ||
  "scene-main";

/** Human-facing scene name derived from the source file basename. */
export const webGalSceneNameForPath = (path: string): string => {
  const normalized = normalizeWebGalWorkspacePath(path);
  const basename = stripWebGalExtension(normalized.split("/").at(-1) || "");
  return basename.normalize("NFKC").trim() || "Scene";
};

const isSceneDirectoryFile = (path: string): boolean =>
  WEBGAL_SCENE_EXTENSION.test(path) &&
  path.split("/").some((part) => part.toLocaleLowerCase("en-US") === "scene");

const normalizeFiles = (
  files: readonly AltairSourceFile[],
  signal: AbortSignal,
): readonly NormalizedSourceFile[] => {
  if (!Array.isArray(files) || !files.length) {
    throw new TypeError("WebGAL workspace import requires at least one file");
  }
  if (files.length > WEBGAL_WORKSPACE_LIMITS.files) {
    throw new RangeError(
      `WebGAL workspace contains ${files.length} files; the limit is ${WEBGAL_WORKSPACE_LIMITS.files}`,
    );
  }
  const paths = new Set<string>();
  const normalized: NormalizedSourceFile[] = [];
  let totalBytes = 0;
  for (const file of files) {
    throwIfAborted(signal);
    if (!file || typeof file !== "object" || !(file.bytes instanceof Uint8Array)) {
      throw new TypeError("WebGAL workspace files require Uint8Array bytes");
    }
    const path = normalizeWebGalWorkspacePath(file.path);
    if (paths.has(path)) {
      throw new TypeError(
        `WebGAL workspace path is duplicated after normalization: ${path}`,
      );
    }
    paths.add(path);
    totalBytes += file.bytes.byteLength;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > WEBGAL_WORKSPACE_LIMITS.totalBytes
    ) {
      throw new RangeError(
        `WebGAL workspace exceeds the ${WEBGAL_WORKSPACE_LIMITS.totalBytes}-byte limit`,
      );
    }
    normalized.push({
      path,
      bytes: file.bytes,
      ...(file.mediaType === undefined ? {} : { mediaType: file.mediaType }),
    });
  }
  return normalized;
};

const selectSceneFiles = (
  files: readonly NormalizedSourceFile[],
  entryPath: string | undefined,
  options: ImportWebGalOptions,
  allowEmpty = false,
): readonly WebGalSceneSource[] => {
  const inSceneDirectory = files.filter(({ path }) =>
    isSceneDirectoryFile(path),
  );
  const recognized = files.filter(({ path }) =>
    WEBGAL_SCENE_EXTENSION.test(path),
  );
  let selected =
    inSceneDirectory.length > 0
      ? inSceneDirectory
      : recognized.filter(
          ({ path }) =>
            !/(?:^|\/)config\.txt$/iu.test(path) ||
            path === entryPath ||
            recognized.length === 1,
        );
  if (entryPath) {
    const explicit = files.find(({ path }) => path === entryPath);
    if (!explicit) {
      throw new RangeError(
        `WebGAL workspace entry does not exist: ${entryPath}`,
      );
    }
    if (!WEBGAL_SCENE_EXTENSION.test(explicit.path)) {
      if (allowEmpty) return [];
      throw new TypeError(
        `WebGAL workspace entry is not a scene source: ${entryPath}`,
      );
    }
    if (!selected.some(({ path }) => path === explicit.path)) {
      selected = [...selected, explicit];
    }
  }
  if (!selected.length) {
    if (allowEmpty) return [];
    throw new RangeError("WebGAL workspace contains no scene source files");
  }
  if (selected.length > WEBGAL_WORKSPACE_LIMITS.sceneFiles) {
    throw new RangeError(
      `WebGAL workspace contains ${selected.length} scene files; the limit is ${WEBGAL_WORKSPACE_LIMITS.sceneFiles}`,
    );
  }
  const single = selected.length === 1;
  const sceneIds = new Map<string, string>();
  return selected.map((file) => {
    if (file.bytes.byteLength > WEBGAL_WORKSPACE_LIMITS.sceneBytes) {
      throw new RangeError(
        `WebGAL scene ${file.path} exceeds the ${WEBGAL_WORKSPACE_LIMITS.sceneBytes}-byte limit`,
      );
    }
    const sceneId =
      single && options.sceneId
        ? options.sceneId
        : webGalSceneIdForPath(file.path);
    const previous = sceneIds.get(sceneId);
    if (previous) {
      throw new TypeError(
        `WebGAL scene paths resolve to the same scene ID '${sceneId}': ${previous}, ${file.path}`,
      );
    }
    sceneIds.set(sceneId, file.path);
    return {
      ...file,
      sceneId,
      sceneName:
        single && options.sceneName
          ? options.sceneName
          : webGalSceneNameForPath(file.path),
    };
  });
};

const mappedSceneIdForPath = (
  project: StoryProject,
  sourcePath: string,
): string | undefined => {
  const workspace = objectValue(project.extensions["altair:workspace"]);
  const mappings = workspace?.sourcePaths;
  if (!Array.isArray(mappings)) return undefined;
  for (const mapping of mappings) {
    const entry = objectValue(mapping);
    if (
      typeof entry?.id === "string" &&
      typeof entry.path === "string"
    ) {
      try {
        if (normalizeWebGalWorkspacePath(entry.path) === sourcePath) {
          return entry.id;
        }
      } catch {
        // An embedded snapshot cannot weaken the current path boundary.
      }
    }
  }
  return undefined;
};

const sourceScene = (
  source: WebGalSceneSource,
  project: StoryProject,
): StoryScene | undefined => {
  const mappedId = mappedSceneIdForPath(project, source.path);
  return (
    project.scenes.find(({ id }) => id === source.sceneId) ??
    (mappedId
      ? project.scenes.find(({ id }) => id === mappedId)
      : undefined) ??
    (project.scenes.length === 1
      ? project.scenes[0]
      : project.scenes.find(({ id }) => id === project.entrySceneId))
  );
};

const diagnosticForFile = (
  sourcePath: string,
  diagnostic: StoryDiagnostic,
): StoryDiagnostic => ({
  ...diagnostic,
  path: `webgal:${sourcePath}:${diagnostic.path}`,
});

const sameJson = (left: JsonValue, right: JsonValue): boolean =>
  stringifyStoryJson(left, false) === stringifyStoryJson(right, false);

const mergeJsonObject = (
  target: JsonObject,
  incoming: JsonObject,
  onConflict?: (path: string) => void,
  prefix = "",
): JsonObject => {
  for (const [key, value] of Object.entries(incoming)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const current = target[key];
    if (current === undefined) {
      target[key] = cloneStoryValue(value);
      continue;
    }
    const currentObject = objectValue(current);
    const incomingObject = objectValue(value);
    if (currentObject && incomingObject) {
      mergeJsonObject(currentObject, incomingObject, onConflict, path);
    } else if (!sameJson(current, value)) {
      onConflict?.(path);
    }
  }
  return target;
};

const uniqueCommandIds = (scenes: readonly StoryScene[]): StoryScene[] => {
  const used = new Set(scenes.map(({ id }) => id));
  return scenes.map((scene) => {
    const remapped = new Map<string, string>();
    const commands: StoryProjectCommand[] = scene.commands.map((command) => {
      let id = command.id;
      if (used.has(id)) {
        const base = `${scene.id}:${id}`;
        id = base;
        let suffix = 2;
        while (used.has(id)) id = `${base}:${suffix++}`;
      }
      used.add(id);
      if (id !== command.id) remapped.set(command.id, id);
      return id === command.id
        ? cloneStoryValue(command)
        : { ...cloneStoryValue(command), id };
    });
    const extensions = cloneStoryValue(scene.extensions);
    const webgal = objectValue(extensions.webgal);
    if (webgal && Array.isArray(webgal.originalCommandIds)) {
      webgal.originalCommandIds = webgal.originalCommandIds.map((id) =>
        typeof id === "string" ? remapped.get(id) ?? id : id,
      );
    }
    return {
      ...cloneStoryValue(scene),
      commands,
      extensions,
    };
  });
};

const selectEntrySource = (
  sources: readonly WebGalSceneSource[],
  entryPath: string | undefined,
): WebGalSceneSource => {
  const explicit = entryPath
    ? sources.find(({ path }) => path === entryPath)
    : undefined;
  if (entryPath && !explicit) {
    throw new RangeError(
      `WebGAL workspace entry is not an imported scene: ${entryPath}`,
    );
  }
  return (
    explicit ??
    sources.find(({ sceneId }) => sceneId.toLocaleLowerCase("en-US") === "start") ??
    sources.find(
      ({ sceneId }) =>
        sceneId.split("/").at(-1)?.toLocaleLowerCase("en-US") === "start",
    ) ??
    sources[0]!
  );
};

/**
 * Import a complete WebGAL workspace at the format-plugin boundary.
 * Non-scene files participate in resource bounds but are not decoded as text.
 */
export const importWebGalWorkspace = async (
  request: AltairFormatRequest & { readonly signal: AbortSignal },
  options: ImportWebGalOptions = {},
): Promise<AltairFormatImportResult> => {
  throwIfAborted(request.signal);
  const files = normalizeFiles(request.files, request.signal);
  const entryPath = request.entryPath
    ? normalizeWebGalWorkspacePath(request.entryPath)
    : undefined;
  const sources = selectSceneFiles(files, entryPath, options);
  const requestedEntry = selectEntrySource(sources, entryPath);
  const imported: ImportedSceneSource[] = [];
  const diagnostics: StoryDiagnostic[] = [];
  const importErrors: unknown[] = [];

  for (const source of sources) {
    throwIfAborted(request.signal);
    try {
      const result = importWebGal(source.bytes, {
        ...options,
        sceneId: source.sceneId,
        sceneName: source.sceneName,
      });
      const scene = sourceScene(source, result.project);
      if (!scene) {
        throw new Error(
          `WebGAL import did not return scene '${source.sceneId}'`,
        );
      }
      imported.push({
        source,
        result,
        scene: {
          ...cloneStoryValue(scene),
          id: source.sceneId,
          ...(scene.id === source.sceneId
            ? {}
            : { name: source.sceneName }),
        },
        originalSceneId: scene.id,
      });
      diagnostics.push(
        ...result.diagnostics.map((diagnostic) =>
          diagnosticForFile(source.path, diagnostic),
        ),
      );
    } catch (error) {
      throwIfAborted(request.signal);
      importErrors.push(error);
      diagnostics.push(
        storyDiagnostic(
          "error",
          "webgal.workspace.importFailed",
          `webgal:${source.path}`,
          error instanceof Error ? error.message : String(error),
          "unsupported",
        ),
      );
    }
  }
  if (!imported.length) {
    throw new AggregateError(
      importErrors,
      "No WebGAL workspace scenes could be imported",
    );
  }

  let entry = imported.find(({ source }) => source.path === requestedEntry.path);
  if (!entry) {
    entry =
      imported.find(
        ({ source }) =>
          source.sceneId.toLocaleLowerCase("en-US") === "start",
      ) ?? imported[0];
    diagnostics.push(
      storyDiagnostic(
        "warning",
        "webgal.workspace.entryFallback",
        `webgal:${requestedEntry.path}`,
        `The requested entry scene could not be imported; '${entry!.source.path}' is used instead`,
        "approximate",
      ),
    );
  }
  const resolvedEntry = entry ?? imported[0]!;

  const snapshot =
    (resolvedEntry.result.project.scenes.length > 1
      ? resolvedEntry
      : imported.find(({ result }) => result.project.scenes.length > 1)) ??
    resolvedEntry;
  const baseProject = cloneStoryValue(snapshot.result.project);
  const replacedSceneIds = new Set(
    imported.map(({ originalSceneId }) => originalSceneId),
  );
  const selectedSceneIds = new Set(imported.map(({ source }) => source.sceneId));
  const scenes = uniqueCommandIds([
    ...imported.map(({ scene }) => scene),
    ...baseProject.scenes.filter(
      ({ id }) => !replacedSceneIds.has(id) && !selectedSceneIds.has(id),
    ),
  ]);

  const assets: JsonObject = {};
  const runtime: JsonObject = {};
  const storyFields: JsonObject = {};
  const extensions: JsonObject = {};
  for (const item of [
    resolvedEntry,
    ...imported.filter((candidate) => candidate !== resolvedEntry),
  ]) {
    const conflict = (path: string): void => {
      diagnostics.push(
        storyDiagnostic(
          "warning",
          "webgal.workspace.mergeConflict",
          `webgal:${item.source.path}:${path}`,
          `Workspace metadata '${path}' differs between WebGAL scenes; the first value is retained`,
          "preserved-only",
        ),
      );
    };
    mergeJsonObject(assets, item.result.project.assets, conflict, "assets");
    mergeJsonObject(runtime, item.result.project.runtime, conflict, "runtime");
    mergeJsonObject(
      storyFields,
      item.result.project.storyFields,
      conflict,
      "storyFields",
    );
    mergeJsonObject(
      extensions,
      item.result.project.extensions,
      conflict,
      "extensions",
    );
  }
  extensions["altair:workspace"] = {
    sourcePaths: imported.map(({ source }) => ({
      id: source.sceneId,
      path: source.path,
    })),
  };

  const project: StoryProject = {
    version: STORY_PROJECT_VERSION,
    meta: cloneStoryValue(baseProject.meta),
    entrySceneId: resolvedEntry.source.sceneId,
    scenes,
    assets,
    runtime,
    storyFields,
    ...(baseProject.plugins === undefined
      ? {}
      : { plugins: cloneStoryValue(baseProject.plugins) }),
    extensions,
  };
  assertValidStoryProject(project);
  throwIfAborted(request.signal);
  return {
    format: "webgal",
    project,
    diagnostics,
  };
};

const workspaceSourcePaths = (
  project: StoryProject,
): ReadonlyMap<string, string> => {
  const workspace = objectValue(project.extensions["altair:workspace"]);
  const mappings = workspace?.sourcePaths;
  const result = new Map<string, string>();
  if (!Array.isArray(mappings)) return result;
  for (const mapping of mappings) {
    const entry = objectValue(mapping);
    if (
      typeof entry?.id !== "string" ||
      typeof entry.path !== "string" ||
      result.has(entry.id)
    ) {
      continue;
    }
    result.set(entry.id, normalizeWebGalWorkspacePath(entry.path));
  }
  return result;
};

const fallbackScenePath = (sceneId: string): string =>
  `scene/${sceneId.split("/").map(safeScenePart).join("/") || "scene-main"}.txt`;

interface WebGalWorkspaceExportOptions {
  readonly localeIndex?: number;
  readonly lineEnding?: "\n" | "\r\n";
  readonly preserveUnchangedSource?: boolean;
  readonly losslessMetadata?: WebGalLosslessMetadataScope;
}

const exportOptions = (
  value: JsonObject | undefined,
): WebGalWorkspaceExportOptions => {
  if (!value) return {};
  const localeIndex =
    Number.isSafeInteger(value.localeIndex) && Number(value.localeIndex) >= 0
      ? Number(value.localeIndex)
      : undefined;
  const lineEnding =
    value.lineEnding === "\n" || value.lineEnding === "\r\n"
      ? value.lineEnding
      : undefined;
  const preserveUnchangedSource =
    typeof value.preserveUnchangedSource === "boolean"
      ? value.preserveUnchangedSource
      : undefined;
  const losslessMetadata =
    value.losslessMetadata === false ||
    value.losslessMetadata === "scene" ||
    value.losslessMetadata === "project"
      ? value.losslessMetadata
      : undefined;
  return {
    ...(localeIndex === undefined ? {} : { localeIndex }),
    ...(lineEnding === undefined ? {} : { lineEnding }),
    ...(preserveUnchangedSource === undefined
      ? {}
      : { preserveUnchangedSource }),
    ...(losslessMetadata === undefined ? {} : { losslessMetadata }),
  };
};

/** Export every scene artifact while retaining the imported workspace paths. */
export const exportWebGalWorkspace = (
  request: AltairFormatExportRequest & { readonly signal: AbortSignal },
): AltairFormatExportResult => {
  throwIfAborted(request.signal);
  assertValidStoryProject(request.project);
  if (request.project.scenes.length > WEBGAL_WORKSPACE_LIMITS.sceneFiles) {
    throw new RangeError(
      `WebGAL project contains ${request.project.scenes.length} scenes; the limit is ${WEBGAL_WORKSPACE_LIMITS.sceneFiles}`,
    );
  }
  const mappings = workspaceSourcePaths(request.project);
  const explicitEntryPath = request.entryPath
    ? normalizeWebGalWorkspacePath(request.entryPath)
    : undefined;
  if (
    explicitEntryPath &&
    !WEBGAL_SCENE_EXTENSION.test(explicitEntryPath)
  ) {
    throw new TypeError(
      `WebGAL export entry is not a scene source: ${explicitEntryPath}`,
    );
  }
  const options = exportOptions(request.options);
  const paths = new Set<string>();
  const artifacts: AltairFormatExportResult["artifacts"][number][] = [];
  const diagnostics: StoryDiagnostic[] = [];

  for (const scene of request.project.scenes) {
    throwIfAborted(request.signal);
    const path = normalizeWebGalWorkspacePath(
      scene.id === request.project.entrySceneId && explicitEntryPath
        ? explicitEntryPath
        : mappings.get(scene.id) ?? fallbackScenePath(scene.id),
    );
    if (!WEBGAL_SCENE_EXTENSION.test(path)) {
      throw new TypeError(
        `WebGAL source path for scene '${scene.id}' has no supported extension: ${path}`,
      );
    }
    if (paths.has(path)) {
      throw new TypeError(
        `WebGAL export path is shared by multiple scenes: ${path}`,
      );
    }
    paths.add(path);
    const losslessMetadata =
      options.losslessMetadata === false
        ? false
        : scene.id === request.project.entrySceneId
          ? options.losslessMetadata ?? "project"
          : "scene";
    const serialized = serializeWebGal(request.project, {
      sceneId: scene.id,
      losslessMetadata,
      ...(options.localeIndex === undefined
        ? {}
        : { localeIndex: options.localeIndex }),
      ...(options.lineEnding === undefined
        ? {}
        : { lineEnding: options.lineEnding }),
      ...(options.preserveUnchangedSource === undefined
        ? {}
        : { preserveUnchangedSource: options.preserveUnchangedSource }),
    });
    const bytes = encoder.encode(serialized.text);
    if (bytes.byteLength > WEBGAL_WORKSPACE_LIMITS.sceneBytes) {
      throw new RangeError(
        `Exported WebGAL scene ${path} exceeds the ${WEBGAL_WORKSPACE_LIMITS.sceneBytes}-byte limit`,
      );
    }
    artifacts.push({
      path,
      bytes,
      mediaType: "text/x-webgal",
    });
    diagnostics.push(
      ...serialized.diagnostics.map((diagnostic) =>
        diagnosticForFile(path, diagnostic),
      ),
    );
  }
  throwIfAborted(request.signal);
  return { artifacts, diagnostics };
};

/** Lightweight workspace-aware sniffing without decoding binary assets. */
export const sniffWebGalWorkspace = (
  request: AltairFormatRequest & { readonly signal: AbortSignal },
  sniff: (input: Uint8Array) => number,
): number => {
  throwIfAborted(request.signal);
  const files = normalizeFiles(request.files, request.signal);
  const entryPath = request.entryPath
    ? normalizeWebGalWorkspacePath(request.entryPath)
    : undefined;
  const candidates = selectSceneFiles(files, entryPath, {}, true);
  if (!candidates.length) return 0;
  const entry = selectEntrySource(candidates, entryPath);
  const score = sniff(entry.bytes);
  return candidates.length > 1 && score > 0 ? Math.max(score, 0.9) : score;
};
