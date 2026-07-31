import type { StoryProject } from "@haneoka/altair/model";
import type {
  AltairFormatExportRequest,
  AltairFormatExportResult,
  AltairFormatRequest,
  AltairFormatImportResult,
  AltairSourceFile,
} from "@haneoka/altair/protocol";
import { normalizeWebGalWorkspacePath } from "./workspace.js";

export type WebGalWorkspaceResourceKind =
  | "scene"
  | "background"
  | "figure"
  | "image"
  | "audio"
  | "video"
  | "data"
  | "other";

export type WebGalWorkspaceAudioUsage = "bgm" | "se" | "voice";

export interface WebGalWorkspaceResourceClassification {
  readonly kind: WebGalWorkspaceResourceKind;
  readonly logicalPath: string;
  readonly resourceKey: string;
  readonly usage?: WebGalWorkspaceAudioUsage;
}

export interface WebGalBrowserWorkspaceFile extends WebGalWorkspaceResourceClassification {
  readonly file: File;
  readonly path: string;
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  readonly mediaType: string;
  readonly url?: string;
}

export type WebGalWorkspaceVisualInsertKind = "background" | "still" | "frame";

export type WebGalWorkspaceResourceInsert =
  | {
      readonly kind: WebGalWorkspaceVisualInsertKind | "video";
      readonly key: string;
      readonly value: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "audio";
      readonly usage: WebGalWorkspaceAudioUsage;
      readonly key: string;
      readonly value: Readonly<Record<string, unknown>>;
    };

export interface WebGalFormatOperations {
  importFormat(
    request: AltairFormatRequest,
    formatId?: string,
  ): Promise<AltairFormatImportResult>;
  exportFormat(
    formatId: string,
    request: AltairFormatExportRequest,
  ): Promise<AltairFormatExportResult>;
}

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "opus",
  "wav",
  "weba",
]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogv", "webm"]);
const DATA_EXTENSIONS = new Set([
  "css",
  "json",
  "txt",
  "webgal",
  "wg",
  "yaml",
  "yml",
]);

const pathExtension = (path: string): string =>
  path.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLocaleLowerCase("en-US") ?? "";

const workspaceContentPath = (path: string): readonly string[] => {
  const segments = path.split("/");
  const gameIndex = segments.findIndex(
    (segment) => segment.toLocaleLowerCase("en-US") === "game",
  );
  return gameIndex >= 0 ? segments.slice(gameIndex + 1) : segments;
};

/**
 * Applies WebGAL's standard `game/*` directory semantics. Generic extension
 * fallbacks are intentionally last so a host can display extra project files
 * without pretending they belong to a WebGAL resource category.
 */
export const classifyWebGalWorkspacePath = (
  sourcePath: string,
): WebGalWorkspaceResourceClassification => {
  const path = normalizeWebGalWorkspacePath(sourcePath);
  const content = workspaceContentPath(path);
  const root = content[0]?.toLocaleLowerCase("en-US") ?? "";
  const extension = pathExtension(path);
  const logicalPath = content.length ? `game/${content.join("/")}` : path;
  const resourceKey = content.slice(1).join("/") || content.at(-1) || path;

  if (root === "scene" && ["txt", "webgal", "wg"].includes(extension)) {
    return { kind: "scene", logicalPath, resourceKey };
  }
  if (
    root === "background" &&
    (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension))
  ) {
    return { kind: "background", logicalPath, resourceKey };
  }
  if (
    root === "figure" &&
    (IMAGE_EXTENSIONS.has(extension) || extension === "json")
  ) {
    return { kind: "figure", logicalPath, resourceKey };
  }
  if (root === "bgm" && AUDIO_EXTENSIONS.has(extension)) {
    return { kind: "audio", usage: "bgm", logicalPath, resourceKey };
  }
  if (
    (root === "vocal" || root === "voice" || root === "sound") &&
    AUDIO_EXTENSIONS.has(extension)
  ) {
    return {
      kind: "audio",
      usage: root === "vocal" || root === "voice" ? "voice" : "se",
      logicalPath,
      resourceKey,
    };
  }
  if (root === "video" && VIDEO_EXTENSIONS.has(extension)) {
    return { kind: "video", logicalPath, resourceKey };
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { kind: "image", logicalPath, resourceKey };
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return { kind: "audio", usage: "se", logicalPath, resourceKey };
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return { kind: "video", logicalPath, resourceKey };
  }
  if (DATA_EXTENSIONS.has(extension)) {
    return { kind: "data", logicalPath, resourceKey };
  }
  return { kind: "other", logicalPath, resourceKey };
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return;
  throw (
    signal.reason ??
    new DOMException("WebGAL workspace operation aborted", "AbortError")
  );
};

export const webGalWorkspaceSourceFiles = async (
  files: readonly Pick<
    WebGalBrowserWorkspaceFile,
    "file" | "path" | "mediaType"
  >[],
  signal?: AbortSignal,
): Promise<readonly AltairSourceFile[]> => {
  const result: AltairSourceFile[] = [];
  for (const source of files) {
    throwIfAborted(signal);
    const path = normalizeWebGalWorkspacePath(source.path);
    const bytes = new Uint8Array(await source.file.arrayBuffer());
    throwIfAborted(signal);
    result.push({
      path,
      bytes,
      ...(source.mediaType ? { mediaType: source.mediaType } : {}),
    });
  }
  return result;
};

export const importWebGalBrowserWorkspace = async (
  operations: WebGalFormatOperations,
  files: readonly Pick<
    WebGalBrowserWorkspaceFile,
    "file" | "path" | "mediaType"
  >[],
  options: {
    readonly title?: string;
    readonly releaseServer?: string;
    readonly entryPath?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<AltairFormatImportResult> =>
  operations.importFormat(
    {
      files: await webGalWorkspaceSourceFiles(files, options.signal),
      ...(options.entryPath ? { entryPath: options.entryPath } : {}),
      options: {
        ...(options.title ? { title: options.title } : {}),
        ...(options.releaseServer
          ? { releaseServer: options.releaseServer }
          : {}),
      },
      ...(options.signal ? { signal: options.signal } : {}),
    },
    "webgal",
  );

export const exportWebGalBrowserWorkspace = (
  operations: WebGalFormatOperations,
  project: StoryProject,
  options: {
    readonly localeIndex?: number;
    readonly entryPath?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<AltairFormatExportResult> =>
  operations.exportFormat("webgal", {
    project,
    ...(options.entryPath ? { entryPath: options.entryPath } : {}),
    options: {
      ...(options.localeIndex === undefined
        ? {}
        : { localeIndex: options.localeIndex }),
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

const commonResource = (
  file: Pick<
    WebGalBrowserWorkspaceFile,
    "resourceKey" | "logicalPath" | "path"
  >,
): Readonly<Record<string, unknown>> => ({
  resourceRef: file.resourceKey,
  source: file.logicalPath,
  url: file.logicalPath,
  sourcePath: file.path,
  runtimeAvailable: true,
});

export const webGalWorkspaceResourceInsert = (
  file: Pick<
    WebGalBrowserWorkspaceFile,
    "kind" | "usage" | "resourceKey" | "logicalPath" | "path"
  >,
  preferredVisualKind?: WebGalWorkspaceVisualInsertKind,
): WebGalWorkspaceResourceInsert | undefined => {
  const common = commonResource(file);
  if (file.kind === "background") {
    return {
      kind: "background",
      key: file.resourceKey,
      value: { ...common, webgalKind: "background" },
    };
  }
  if (file.kind === "figure" || file.kind === "image") {
    const kind = preferredVisualKind === "frame" ? "frame" : "still";
    return {
      kind,
      key: file.resourceKey,
      value:
        kind === "frame"
          ? {
              ...common,
              texture: file.logicalPath,
              webgalKind: "figure",
            }
          : { ...common, webgalKind: "figure" },
    };
  }
  if (file.kind === "audio") {
    const usage = file.usage ?? "se";
    return {
      kind: "audio",
      usage,
      key: file.resourceKey,
      value: {
        resourceRef: file.resourceKey,
        source: file.logicalPath,
        playableUrl: file.logicalPath,
        webgalKind: usage === "bgm" ? "bgm" : "vocal",
      },
    };
  }
  if (file.kind === "video") {
    return {
      kind: "video",
      key: file.resourceKey,
      value: {
        ...common,
        playableUrl: file.logicalPath,
        webgalKind: "video",
      },
    };
  }
  return undefined;
};

const normalizedUrlIndex = (
  files: readonly Pick<
    WebGalBrowserWorkspaceFile,
    "path" | "logicalPath" | "resourceKey" | "url"
  >[],
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const file of files) {
    if (!file.url) continue;
    for (const reference of [file.path, file.logicalPath, file.resourceKey]) {
      result.set(
        normalizeWebGalWorkspacePath(reference).toLocaleLowerCase("en-US"),
        file.url,
      );
    }
  }
  return result;
};

export const hydrateWebGalWorkspaceAssetUrls = <Value>(
  value: Value,
  files: readonly Pick<
    WebGalBrowserWorkspaceFile,
    "path" | "logicalPath" | "resourceKey" | "url"
  >[],
): Value => {
  const urls = normalizedUrlIndex(files);
  if (!urls.size) return value;
  const hydrate = (entry: unknown): unknown => {
    if (typeof entry === "string") {
      try {
        return (
          urls.get(
            normalizeWebGalWorkspacePath(entry).toLocaleLowerCase("en-US"),
          ) ?? entry
        );
      } catch {
        return entry;
      }
    }
    if (Array.isArray(entry)) return entry.map(hydrate);
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(
      Object.entries(entry).map(([key, nested]) => [key, hydrate(nested)]),
    );
  };
  return hydrate(value) as Value;
};
