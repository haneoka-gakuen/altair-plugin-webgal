import type {
  ResourceBrowserDirectory,
  ResourceBrowserFile,
  ResourceBrowserInsert,
  ResourceBrowserPath,
  ResourceBrowserProvider,
  ResourceBrowserRequest,
} from "@haneoka/altair/resource-browser";
import {
  webGalWorkspaceResourceInsert,
  type WebGalBrowserWorkspaceFile,
  type WebGalWorkspaceVisualInsertKind,
} from "./resources.js";

export interface WebGalResourceBrowserProviderOptions {
  readonly files: readonly WebGalBrowserWorkspaceFile[] | (() => readonly WebGalBrowserWorkspaceFile[]);
  readonly id?: string;
  readonly name?: string;
  readonly refresh?: (request: ResourceBrowserRequest) => void | Promise<void>;
  readonly dispose?: () => void | Promise<void>;
}

export type WebGalResourceBrowserFile = ResourceBrowserFile<WebGalBrowserWorkspaceFile>;
export type WebGalResourceBrowserInsert = ResourceBrowserInsert<Readonly<Record<string, unknown>>>;

const ROOT = "workspace";
const rootPath = Object.freeze([ROOT]);

const filesFrom = (options: WebGalResourceBrowserProviderOptions): readonly WebGalBrowserWorkspaceFile[] =>
  typeof options.files === "function" ? options.files() : options.files;

const contentPath = (file: WebGalBrowserWorkspaceFile): readonly string[] =>
  file.logicalPath
    .replace(/^game\//iu, "")
    .split("/")
    .filter(Boolean);

const browserPath = (file: WebGalBrowserWorkspaceFile): ResourceBrowserPath => [ROOT, ...contentPath(file)];

const acceptedKinds = (file: WebGalBrowserWorkspaceFile): readonly string[] => {
  if (file.kind === "background") return ["background"];
  if (file.kind === "figure" || file.kind === "image") {
    return ["still", "frame"];
  }
  if (file.kind === "audio") return ["audio"];
  if (file.kind === "video") return ["video"];
  return [];
};

const requestAccepts = (kinds: readonly string[], request: ResourceBrowserRequest): boolean =>
  request.acceptedKinds.length === 0 || kinds.some((kind) => request.acceptedKinds.includes(kind));

const throwIfAborted = (request: ResourceBrowserRequest): void => {
  if (!request.signal?.aborted) return;
  throw request.signal.reason ?? new DOMException("Resource browsing aborted", "AbortError");
};

const displayKind = (file: WebGalBrowserWorkspaceFile): WebGalResourceBrowserFile["displayKind"] => {
  if (file.kind === "background" || file.kind === "figure" || file.kind === "image") {
    return "image";
  }
  if (file.kind === "audio" || file.kind === "video") return file.kind;
  return "data";
};

const fileNode = (file: WebGalBrowserWorkspaceFile, request: ResourceBrowserRequest): WebGalResourceBrowserFile => {
  const kinds = acceptedKinds(file);
  const kind = displayKind(file);
  return {
    type: "file",
    id: `webgal:${file.path}`,
    name: file.name,
    path: browserPath(file),
    detail: file.logicalPath,
    displayKind: kind,
    ...(kind === "image" && file.url ? { previewUrl: file.url } : {}),
    ...(kind === "audio" && file.url ? { audioPreviewUrl: file.url } : {}),
    acceptedKinds: kinds,
    available: kinds.length > 0 && requestAccepts(kinds, request),
    reference: file,
  };
};

const directoryNode = (path: ResourceBrowserPath): ResourceBrowserDirectory => ({
  type: "directory",
  id: `webgal:${path.join("/")}`,
  name: path.at(-1) || ROOT,
  path,
});

const canonicalBrowserPath = (path: ResourceBrowserPath): string[] => {
  if (!Array.isArray(path) || path[0] !== ROOT) {
    throw new TypeError("Resource browser path is outside this provider");
  }
  return path.map((segment) => {
    if (typeof segment !== "string" || !segment || segment === "." || segment === ".." || segment.includes("/")) {
      throw new TypeError("Resource browser path is invalid");
    }
    return segment;
  });
};

const preferredVisualKind = (request: ResourceBrowserRequest): WebGalWorkspaceVisualInsertKind | undefined => {
  for (const kind of [request.preferredKind, ...request.acceptedKinds]) {
    if (kind === "background" || kind === "still" || kind === "frame") {
      return kind;
    }
  }
  return undefined;
};

export const createWebGalResourceBrowserProvider = (
  options: WebGalResourceBrowserProviderOptions,
): ResourceBrowserProvider<WebGalBrowserWorkspaceFile, Readonly<Record<string, unknown>>> => {
  const root: ResourceBrowserDirectory = Object.freeze({
    type: "directory",
    id: "webgal:workspace",
    name: options.name?.trim() || "WebGAL Workspace",
    path: rootPath,
  });
  return Object.freeze({
    id: options.id?.trim() || "haneoka.altair.webgal.resources",
    name: options.name?.trim() || "WebGAL Workspace",
    roots: Object.freeze([root]),
    preferredPath(request: ResourceBrowserRequest) {
      throwIfAborted(request);
      const preferred = request.preferredKind;
      if (!preferred) return rootPath;
      const file = filesFrom(options).find((entry) => acceptedKinds(entry).includes(preferred));
      return file ? browserPath(file).slice(0, -1) : rootPath;
    },
    list(path: ResourceBrowserPath, request: ResourceBrowserRequest) {
      throwIfAborted(request);
      const current = canonicalBrowserPath(path);
      const relative = current.slice(1);
      const directories = new Map<string, ResourceBrowserDirectory>();
      const files: WebGalResourceBrowserFile[] = [];
      for (const file of filesFrom(options)) {
        const segments = contentPath(file);
        if (!relative.every((segment, index) => segments[index] === segment)) {
          continue;
        }
        const remaining = segments.slice(relative.length);
        if (remaining.length === 0) continue;
        if (remaining.length === 1) {
          const node = fileNode(file, request);
          if (node.acceptedKinds.length > 0) files.push(node);
          continue;
        }
        const childPath = [...current, remaining[0]!];
        const child = directoryNode(childPath);
        directories.set(child.id, child);
      }
      return [
        ...[...directories.values()].sort((left, right) =>
          left.name.localeCompare(right.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
        ...files.sort((left, right) =>
          left.name.localeCompare(right.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
      ];
    },
    open(file: ResourceBrowserFile<WebGalBrowserWorkspaceFile>, request: ResourceBrowserRequest) {
      throwIfAborted(request);
      if (!file.available || !requestAccepts(file.acceptedKinds, request)) {
        return undefined;
      }
      const insert = webGalWorkspaceResourceInsert(file.reference, preferredVisualKind(request));
      if (!insert || (request.acceptedKinds.length > 0 && !request.acceptedKinds.includes(insert.kind))) {
        return undefined;
      }
      return {
        kind: insert.kind,
        key: insert.key,
        value: insert.value,
        ...("usage" in insert ? { usage: insert.usage } : {}),
        extensions: {
          sourceSnapshot: {
            path: file.reference.path,
            logicalPath: file.reference.logicalPath,
            resourceKey: file.reference.resourceKey,
            resourceKind: file.reference.kind,
            mediaType: file.reference.mediaType,
          },
        },
      };
    },
    ...(options.refresh
      ? {
          refresh: (request: ResourceBrowserRequest) => options.refresh!(request),
        }
      : {}),
    ...(options.dispose ? { dispose: () => options.dispose!() } : {}),
  });
};
