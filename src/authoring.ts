import type { StoryProject } from "@haneoka/altair/model";
import type {
  AltairFormatExportResult,
  AltairFormatImportResult,
} from "@haneoka/altair/protocol";
import {
  classifyWebGalWorkspacePath,
  type WebGalBrowserWorkspaceFile,
  type WebGalFormatOperations,
  type WebGalWorkspaceResourceKind,
} from "./resources.js";
import {
  normalizeWebGalWorkspacePath,
  webGalSceneIdForPath,
  webGalSceneNameForPath,
} from "./workspace.js";

export interface WebGalAuthoringProfile {
  readonly formatId: "webgal";
  readonly displayName: "WebGAL";
  readonly sceneMediaType: "text/x-webgal";
  readonly sceneExtensions: readonly [".txt", ".wg", ".webgal"];
  readonly scenePickerDescription: "WebGAL scenes";
  readonly defaultProjectTitle: "WebGAL project";
}

export const WEBGAL_AUTHORING_PROFILE: WebGalAuthoringProfile =
  Object.freeze({
    formatId: "webgal",
    displayName: "WebGAL",
    sceneMediaType: "text/x-webgal",
    sceneExtensions: Object.freeze([".txt", ".wg", ".webgal"] as const),
    scenePickerDescription: "WebGAL scenes",
    defaultProjectTitle: "WebGAL project",
  });

export type WebGalAuthoringFileKind =
  | "scene"
  | "image"
  | "audio"
  | "video"
  | "model"
  | "data"
  | "font"
  | "other";

export interface WebGalAuthoringWorkspaceFile
  extends Omit<WebGalBrowserWorkspaceFile, "kind"> {
  readonly kind: WebGalAuthoringFileKind;
  readonly resourceKind: WebGalWorkspaceResourceKind;
  readonly displayPath: string;
}

export interface WebGalSourceDocument {
  readonly id: string;
  readonly name: string;
  /** Editor-facing path below WebGAL's optional `game` root. */
  readonly path: string;
  /** Canonical path used to read and write the backing workspace. */
  readonly sourcePath: string;
  readonly text: string;
}

export interface WebGalSourceWorkspaceImportResult
  extends AltairFormatImportResult {
  readonly errors: ReadonlyMap<string, string>;
}

export interface WebGalSourceWorkspaceExportResult
  extends AltairFormatExportResult {
  readonly documents: readonly WebGalSourceDocument[];
}

const MODEL_EXTENSION = /\.(?:bin|moc3?|model3?)$/iu;
const FONT_EXTENSION = /\.(?:otf|ttf|woff2?)$/iu;

const authoringKind = (
  resourceKind: WebGalWorkspaceResourceKind,
  path: string,
): WebGalAuthoringFileKind => {
  if (resourceKind === "scene") return "scene";
  if (resourceKind === "audio") return "audio";
  if (resourceKind === "video") return "video";
  if (FONT_EXTENSION.test(path)) return "font";
  if (
    MODEL_EXTENSION.test(path) ||
    (/\.json$/iu.test(path) &&
      /(?:^|\/)(?:figure|live2d|model)s?\//iu.test(path))
  ) {
    return "model";
  }
  if (
    resourceKind === "background" ||
    resourceKind === "figure" ||
    resourceKind === "image"
  ) {
    return "image";
  }
  if (resourceKind === "data") return "data";
  return "other";
};

const editorPath = (logicalPath: string): string =>
  logicalPath.replace(/^game\//iu, "");

export const createWebGalAuthoringWorkspaceFile = (
  sourcePath: string,
  file: File,
  url?: string,
): WebGalAuthoringWorkspaceFile => {
  const path = normalizeWebGalWorkspacePath(sourcePath);
  const classification = classifyWebGalWorkspacePath(path);
  return {
    file,
    path,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    mediaType: file.type,
    logicalPath: classification.logicalPath,
    displayPath: editorPath(classification.logicalPath),
    resourceKey: classification.resourceKey,
    resourceKind: classification.kind,
    kind: authoringKind(classification.kind, path),
    ...(classification.usage ? { usage: classification.usage } : {}),
    ...(url ? { url } : {}),
  };
};

export const createWebGalSourceDocument = (
  sourcePath: string,
  text: string,
): WebGalSourceDocument => {
  const path = normalizeWebGalWorkspacePath(sourcePath);
  const classification = classifyWebGalWorkspacePath(path);
  if (classification.kind !== "scene") {
    throw new TypeError(`WebGAL source is not a scene file: ${path}`);
  }
  return {
    id: webGalSceneIdForPath(path),
    name: webGalSceneNameForPath(path),
    path: editorPath(classification.logicalPath),
    sourcePath: path,
    text,
  };
};

export const webGalSourceDocumentFromWorkspaceFile = async (
  file: WebGalAuthoringWorkspaceFile,
): Promise<WebGalSourceDocument | undefined> =>
  file.resourceKind === "scene"
    ? createWebGalSourceDocument(file.path, await file.file.text())
    : undefined;

const starterDocuments = Object.freeze([
  Object.freeze({
    sourcePath: "scene/main.txt",
    text: `; Altair keeps the original WebGAL source alongside visual edits
changeBg:summer-sky.svg -next;
Vega:Welcome to Altair;
Altair:Source, visual cards, flow and runtime preview share one project;
choose:Open the branch:branch|Continue here:end;
label:branch;
callScene:scene/branch.txt;
jumpLabel:end;
label:end;
Altair:The original WebGAL command semantics stay available;
`,
  }),
  Object.freeze({
    sourcePath: "scene/branch.txt",
    text: `; A second scene demonstrates Terre-style multi-file editing
changeBg:observatory.svg -next;
Altair:Each imported scene keeps its own source tab and cursor;
Altair:Returning resumes the caller after this scene;
`,
  }),
]);

export const createWebGalStarterDocuments = (): readonly WebGalSourceDocument[] =>
  starterDocuments.map(({ sourcePath, text }) =>
    createWebGalSourceDocument(sourcePath, text),
  );

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return;
  throw (
    signal.reason ??
    new DOMException("WebGAL source operation aborted", "AbortError")
  );
};

const entryDocument = (
  documents: readonly WebGalSourceDocument[],
): WebGalSourceDocument | undefined =>
  documents.find(
    ({ id }) =>
      id.toLocaleLowerCase("en-US") === "start" ||
      id.toLocaleLowerCase("en-US").endsWith("/start"),
  ) ?? documents[0];

export const importWebGalSourceDocuments = async (
  operations: WebGalFormatOperations,
  documents: readonly WebGalSourceDocument[],
  options: {
    readonly title?: string;
    readonly entryPath?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<WebGalSourceWorkspaceImportResult> => {
  if (!documents.length) {
    throw new TypeError("WebGAL source import requires at least one document");
  }
  const encoder = new TextEncoder();
  const sources = documents.map((document) => {
    throwIfAborted(options.signal);
    return {
      path: normalizeWebGalWorkspacePath(document.sourcePath || document.path),
      bytes: encoder.encode(document.text),
      mediaType: WEBGAL_AUTHORING_PROFILE.sceneMediaType,
    };
  });
  const entryPath =
    options.entryPath ??
    entryDocument(documents)?.sourcePath ??
    entryDocument(documents)?.path;
  const imported = await operations.importFormat(
    {
      files: sources,
      ...(entryPath ? { entryPath: normalizeWebGalWorkspacePath(entryPath) } : {}),
      options: {
        title: options.title ?? WEBGAL_AUTHORING_PROFILE.defaultProjectTitle,
      },
      ...(options.signal ? { signal: options.signal } : {}),
    },
    WEBGAL_AUTHORING_PROFILE.formatId,
  );
  const errors = new Map<string, string>();
  for (const diagnostic of imported.diagnostics) {
    if (diagnostic.severity !== "error") continue;
    const document = documents.find(({ sourcePath, path }) => {
      const canonical = normalizeWebGalWorkspacePath(sourcePath || path);
      return diagnostic.path.startsWith(`webgal:${canonical}`);
    });
    if (document) errors.set(document.id, diagnostic.message);
  }
  return { ...imported, errors };
};

export const exportWebGalSourceDocuments = async (
  operations: WebGalFormatOperations,
  project: StoryProject,
  options: {
    readonly entryPath?: string;
    readonly localeIndex?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<WebGalSourceWorkspaceExportResult> => {
  const exported = await operations.exportFormat(
    WEBGAL_AUTHORING_PROFILE.formatId,
    {
      project,
      ...(options.entryPath ? { entryPath: options.entryPath } : {}),
      options: {
        ...(options.localeIndex === undefined
          ? {}
          : { localeIndex: options.localeIndex }),
      },
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  const decoder = new TextDecoder();
  return {
    ...exported,
    documents: exported.artifacts.map(({ path, bytes }) =>
      createWebGalSourceDocument(path, decoder.decode(bytes)),
    ),
  };
};

export const webGalWorkspaceAssetReferences = (
  files: readonly Pick<
    WebGalAuthoringWorkspaceFile,
    "kind" | "logicalPath" | "resourceKey"
  >[],
): readonly string[] => {
  const references = new Set<string>();
  for (const file of files) {
    if (file.kind === "scene" || file.kind === "other") continue;
    const logicalPath = editorPath(file.logicalPath);
    const basename = logicalPath.split("/").at(-1);
    for (const reference of [
      logicalPath,
      file.resourceKey,
      ...(basename ? [basename] : []),
    ]) {
      if (reference) references.add(reference);
    }
  }
  return [...references];
};

export const webGalSourceEditorLabel = (path: string): string =>
  `${path} ${WEBGAL_AUTHORING_PROFILE.displayName} source editor`;
