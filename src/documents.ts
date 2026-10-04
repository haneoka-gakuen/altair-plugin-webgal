import {
  type AltairDocumentRegistry,
  type AltairDocumentCommand,
  type AltairAuthoredNode,
  type AltairAuthoredWorkspace,
  type StoryProjectCommand,
  type JsonObject,
} from "@haneoka/altair/documents";
import { advCommandToAuthoredNode, storyProjectToAuthoredWorkspace } from "@haneoka/altair-plugin-adv/documents";
import { VEGA_SYSTEM_OPCODE } from "@haneoka/vega-protocol";
import { WEBGAL_COMMAND_TYPES, WEBGAL_RUNTIME_REQUIREMENT } from "@haneoka/vega-plugin-webgal/commands";
import { importWebGalWorkspace } from "./workspace.js";
import type { AltairFormatRequest } from "@haneoka/altair/documents";
const adapter = "haneoka.altair-webgal";
const definitions = [
  ...Object.entries(VEGA_SYSTEM_OPCODE).map(([name, commandType]) => ({ name: `system.${name}`, commandType })),
  ...Object.entries(WEBGAL_COMMAND_TYPES).map(([name, commandType]) => ({ name: `effect.${name}`, commandType })),
];
export const WEBGAL_DOCUMENT_COMMANDS: readonly AltairDocumentCommand[] = [
  ...definitions.map(({ name, commandType }) => ({
    type: { plugin: adapter, name },
    schemaVersion: 1,
    runtimePlugins: typeof commandType === "string" ? [WEBGAL_RUNTIME_REQUIREMENT] : [],
    lower: (node: AltairAuthoredNode) => [
      {
        id: node.id,
        command: commandType,
        fields: node.arguments,
        extensions: (node.extensions?.commandExtensions as JsonObject) ?? {},
      },
    ],
  })),
  {
    type: { plugin: adapter, name: "opaque" },
    schemaVersion: 1,
    runtimePlugins: [],
    lower(node) {
      const value = node.extensions?.source;
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        value.format !== "webgal" ||
        typeof value.raw !== "string"
      )
        throw new TypeError("Opaque WebGAL commands require their original source");
      const extensions = (node.extensions?.commandExtensions as JsonObject) ?? {};
      return [
        {
          id: node.id,
          command: null,
          fields: node.arguments,
          extensions: { ...extensions, webgalOpaque: extensions.webgalOpaque ?? {} },
          source: {
            format: "webgal",
            raw: value.raw,
            ...(typeof value.line === "number" && Number.isSafeInteger(value.line) && value.line > 0
              ? { line: value.line }
              : {}),
            ...(typeof value.command === "string" ? { command: value.command } : {}),
            ...(value.arguments && typeof value.arguments === "object" && !Array.isArray(value.arguments)
              ? { arguments: value.arguments }
              : {}),
          },
        },
      ];
    },
  },
];
export function registerWebGalDocumentCommands(registry: AltairDocumentRegistry): () => void {
  const releases = WEBGAL_DOCUMENT_COMMANDS.map((definition) => registry.register(definition));
  return () => releases.forEach((release) => release());
}
export function webGalCommandToAuthoredNode(command: StoryProjectCommand): AltairAuthoredNode {
  if (command.command === VEGA_SYSTEM_OPCODE.SetDialogueVisibility) return advCommandToAuthoredNode(command);
  const definition = definitions.find((definition) => definition.commandType === command.command);
  if (definition)
    return {
      id: command.id,
      type: { plugin: adapter, name: definition.name },
      schemaVersion: 1,
      arguments: command.fields,
      extensions: {
        commandExtensions: command.extensions,
        ...(command.source ? { source: JSON.parse(JSON.stringify(command.source)) } : {}),
      },
    };
  if (command.command === null)
    return {
      id: command.id,
      type: { plugin: adapter, name: "opaque" },
      schemaVersion: 1,
      arguments: command.fields,
      extensions: {
        commandExtensions: command.extensions,
        ...(command.source ? { source: JSON.parse(JSON.stringify(command.source)) } : {}),
      },
    };
  return advCommandToAuthoredNode(command, webGalCommandToAuthoredNode);
}
export async function importWebGalAuthoredWorkspace(
  request: AltairFormatRequest & { signal: AbortSignal },
): Promise<AltairAuthoredWorkspace> {
  const imported = await importWebGalWorkspace(request);
  const workspace = storyProjectToAuthoredWorkspace(imported.project, webGalCommandToAuthoredNode);
  return {
    ...workspace,
    project: {
      ...workspace.project,
      plugins: workspace.project.plugins.some((plugin) => plugin.id === adapter)
        ? workspace.project.plugins
        : [
            ...workspace.project.plugins,
            { id: adapter, version: "0.1.0", permissions: ["project.read", "project.write"] },
          ],
    },
  };
}
