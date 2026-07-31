import {
  STORY_PROJECT_VERSION,
  type JsonObject,
  type JsonValue,
  type StoryProject,
} from "@haneoka/altair/model";
import type {
  StoryConversionFidelity,
  StoryDiagnostic,
  StoryDiagnosticSeverity,
} from "@haneoka/altair/protocol";

export interface StoryImportResult {
  readonly format: "webgal";
  readonly project: StoryProject;
  readonly diagnostics: StoryDiagnostic[];
}

export const storyDiagnostic = (
  severity: StoryDiagnosticSeverity,
  code: string,
  path: string,
  message: string,
  fidelity?: StoryConversionFidelity,
  line?: number,
): StoryDiagnostic => ({
  severity,
  code,
  path,
  message,
  ...(fidelity === undefined ? {} : { fidelity }),
  ...(line === undefined ? {} : { line }),
});

/** Preserve the valid JSON number `-0`, which native JSON.stringify loses. */
export const stringifyStoryJson = (
  value: JsonValue,
  pretty = true,
): string => {
  let compact: string | undefined;
  try {
    compact = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(
      `value must contain valid JSON data: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (compact === undefined) {
    throw new TypeError("value must contain valid JSON data");
  }
  let marker = "__haneoka_negative_zero__";
  while (compact.includes(JSON.stringify(marker))) marker += "_";
  const markerJson = JSON.stringify(marker);
  const serialized = JSON.stringify(
    value,
    (_key, item: unknown) =>
      typeof item === "number" && Object.is(item, -0) ? marker : item,
    pretty ? 2 : undefined,
  );
  if (serialized === undefined) {
    throw new TypeError("value must contain valid JSON data");
  }
  return serialized.split(markerJson).join("-0");
};

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const DANGEROUS_JSON_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const assertJsonValue = (
  value: unknown,
  path: string,
  seen: Set<object>,
  depth: number,
): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} contains a non-JSON value`);
  }
  if (depth > 128) {
    throw new RangeError(`${path} exceeds the JSON nesting limit`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${path} contains a cyclic JSON value`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError(`${path}[${index}] is an array hole`);
      }
      assertJsonValue(value[index], `${path}[${index}]`, seen, depth + 1);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain plain JSON objects`);
    }
    if (Object.getOwnPropertySymbols(value).length) {
      throw new TypeError(`${path} contains symbol keys`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (DANGEROUS_JSON_KEYS.has(key)) {
        throw new TypeError(`${path}.${key} is not a safe JSON key`);
      }
      assertJsonValue(item, `${path}.${key}`, seen, depth + 1);
    }
  }
  seen.delete(value);
};

const requireObject = (
  value: unknown,
  path: string,
): Record<string, unknown> => {
  if (!record(value)) throw new TypeError(`${path} must be an object`);
  assertJsonValue(value, path, new Set(), 0);
  return value;
};

const requireText = (value: unknown, path: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
};

/**
 * Codec-local structural assertion.
 *
 * Semantic ADV validation remains an ADV plugin responsibility. This boundary
 * only proves that lossless metadata is a finite JSON StoryProject with valid
 * identities before the WebGAL codec reads or merges it.
 */
export function assertValidStoryProject(
  value: unknown,
): asserts value is StoryProject {
  const project = requireObject(value, "$");
  if (project.version !== STORY_PROJECT_VERSION) {
    throw new TypeError(`$.version must be ${STORY_PROJECT_VERSION}`);
  }
  const meta = requireObject(project.meta, "$.meta");
  if (typeof meta.title !== "string") {
    throw new TypeError("$.meta.title must be a string");
  }
  requireObject(project.assets, "$.assets");
  requireObject(project.runtime, "$.runtime");
  requireObject(project.storyFields, "$.storyFields");
  requireObject(project.extensions, "$.extensions");
  if (project.plugins !== undefined && !Array.isArray(project.plugins)) {
    throw new TypeError("$.plugins must be an array");
  }
  if (project.plugins !== undefined) {
    assertJsonValue(project.plugins, "$.plugins", new Set(), 0);
  }
  const entrySceneId = requireText(project.entrySceneId, "$.entrySceneId");
  if (!Array.isArray(project.scenes) || !project.scenes.length) {
    throw new TypeError("$.scenes must contain at least one scene");
  }
  const objectIds = new Set<string>();
  let hasEntry = false;
  for (const [sceneIndex, sceneValue] of project.scenes.entries()) {
    const scenePath = `$.scenes[${sceneIndex}]`;
    const scene = requireObject(sceneValue, scenePath);
    const sceneId = requireText(scene.id, `${scenePath}.id`);
    if (objectIds.has(sceneId)) {
      throw new TypeError(`${scenePath}.id is duplicated: ${sceneId}`);
    }
    objectIds.add(sceneId);
    hasEntry ||= sceneId === entrySceneId;
    if (typeof scene.name !== "string") {
      throw new TypeError(`${scenePath}.name must be a string`);
    }
    requireObject(scene.extensions, `${scenePath}.extensions`);
    if (!Array.isArray(scene.commands)) {
      throw new TypeError(`${scenePath}.commands must be an array`);
    }
    for (const [commandIndex, commandValue] of scene.commands.entries()) {
      const commandPath = `${scenePath}.commands[${commandIndex}]`;
      const command = requireObject(commandValue, commandPath);
      const commandId = requireText(command.id, `${commandPath}.id`);
      if (objectIds.has(commandId)) {
        throw new TypeError(`${commandPath}.id is duplicated: ${commandId}`);
      }
      objectIds.add(commandId);
      if (
        command.command !== null &&
        (!Number.isSafeInteger(command.command) ||
          Number(command.command) < 0)
      ) {
        throw new TypeError(
          `${commandPath}.command must be a non-negative integer or null`,
        );
      }
      requireObject(command.fields, `${commandPath}.fields`);
      requireObject(command.extensions, `${commandPath}.extensions`);
      if (command.source !== undefined) {
        const source = requireObject(
          command.source,
          `${commandPath}.source`,
        );
        requireText(source.format, `${commandPath}.source.format`);
      }
    }
  }
  if (!hasEntry) {
    throw new TypeError(
      `$.entrySceneId does not identify a scene: ${entrySceneId}`,
    );
  }
}
