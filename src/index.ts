import {
  type AltairFormatCodec,
  type AltairPluginV2,
} from "@haneoka/altair/plugins";
import type {
  AltairCommandSchemaContribution,
  AltairFormatContribution,
  AltairValidatorContribution,
} from "@haneoka/altair/protocol";
import {
  WEBGAL_BUILTIN_COMMAND_NAMES,
  importWebGal,
  serializeWebGalText,
  type ImportWebGalOptions,
} from "./webgal";
import {
  exportWebGalWorkspace,
  importWebGalWorkspace,
  sniffWebGalWorkspace,
} from "./workspace";
import { storyDiagnostic } from "./support";
import { ALTAIR_WEBGAL_SERVICE, altairWebGalService } from "./services";
import {
  createWebGalResourceBrowserProvider,
  type WebGalResourceBrowserProviderOptions,
} from "./resource-browser.js";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const importOptions = (value: unknown): ImportWebGalOptions => {
  const options =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const title = optionalString(options.title);
  const sceneId = optionalString(options.sceneId);
  const sceneName = optionalString(options.sceneName);
  const releaseServer = optionalString(options.releaseServer);
  const assetRoot = optionalString(options.assetRoot);
  return {
    ...(title ? { title } : {}),
    ...(sceneId ? { sceneId } : {}),
    ...(sceneName ? { sceneName } : {}),
    ...(releaseServer ? { releaseServer } : {}),
    ...(assetRoot ? { assetRoot } : {}),
    ...(Number.isSafeInteger(options.localeIndex) &&
    Number(options.localeIndex) >= 0
      ? { localeIndex: Number(options.localeIndex) }
      : {}),
    ...(Array.isArray(options.additionalCommandNames) &&
    options.additionalCommandNames.every(
      (name) => typeof name === "string" && name.trim(),
    )
      ? {
          additionalCommandNames: options.additionalCommandNames.map((name) =>
            String(name).trim(),
          ),
        }
      : {}),
  };
};

export const webGalFormatCodec: AltairFormatCodec = {
  id: "webgal",
  extensions: [".txt", ".wg", ".webgal"],
  sniff(input) {
    const sample = decoder.decode(input.slice(0, 8_192));
    if (/^\s*(?:;|[A-Za-z_@][\w@/-]*\s*:)/mu.test(sample)) return 0.82;
    return 0;
  },
  import(input) {
    return importWebGal(input).project;
  },
  export(project) {
    return encoder.encode(
      serializeWebGalText(project, { losslessMetadata: "project" }),
    );
  },
};

export const webGalFormatContribution = Object.freeze({
  id: "webgal",
  name: "WebGAL",
  extensions: webGalFormatCodec.extensions,
  mediaTypes: ["text/plain", "text/x-webgal"],
  sniff(request) {
    return sniffWebGalWorkspace(request, (input) =>
      webGalFormatCodec.sniff(input),
    );
  },
  import(request) {
    return importWebGalWorkspace(request, importOptions(request.options));
  },
  export(request) {
    return exportWebGalWorkspace(request);
  },
} satisfies AltairFormatContribution);

export const webGalFidelityValidator = Object.freeze({
  id: "webgal-fidelity",
  name: "WebGAL fidelity",
  validate(project) {
    return project.scenes.flatMap((scene) =>
      scene.commands.flatMap((command, index) =>
        command.source?.format === "webgal" && command.command === null
          ? [
              storyDiagnostic(
                "warning",
                "webgal.preserved-only",
                `scenes.${scene.id}.commands.${index}`,
                `${command.source.command || "WebGAL command"} is preserved for round trips but is not executable`,
                "preserved-only",
                command.source.line,
              ),
            ]
          : [],
      ),
    );
  },
} satisfies AltairValidatorContribution);

export const webGalCommandSchemas = Object.freeze(
  WEBGAL_BUILTIN_COMMAND_NAMES.map(
    (name) =>
      Object.freeze({
        id: `webgal.command.${name}`,
        name,
        category: "WebGAL",
        sourceNames: [name],
        fields: [
          {
            key: "value",
            label: "Value",
            kind: "string",
          },
          {
            key: "options",
            label: "Options",
            kind: "json",
          },
        ],
        metadata: {
          format: "webgal",
        },
      }) satisfies AltairCommandSchemaContribution,
  ),
);

export interface AltairWebGalPluginOptions {
  readonly resourceFiles?: WebGalResourceBrowserProviderOptions["files"];
  readonly resourceBrowser?: Omit<
    WebGalResourceBrowserProviderOptions,
    "files"
  >;
}

export const createAltairWebGalPlugin = (
  options: AltairWebGalPluginOptions = {},
): AltairPluginV2 => ({
  manifest: {
    id: "haneoka.altair-webgal",
    name: "Altair WebGAL",
    version: "0.1.0",
    apiVersion: 2,
    dependencies: {
      "haneoka.altair-adv": "^0.1.0",
    },
    capabilities: [
      "format",
      "diagnostics",
      "commands",
      "services",
      ...(options.resourceFiles ? ["assets" as const] : []),
    ],
  },
  setup(context) {
    context.provide(ALTAIR_WEBGAL_SERVICE, altairWebGalService);
    context.contribute("format", webGalFormatContribution);
    context.contribute("validator", webGalFidelityValidator);
    for (const schema of webGalCommandSchemas) {
      context.contribute("command", schema);
    }
    if (options.resourceFiles) {
      const provider = createWebGalResourceBrowserProvider({
        ...options.resourceBrowser,
        files: options.resourceFiles,
      });
      if (provider.dispose) {
        context.use({ dispose: () => provider.dispose!() });
      }
      context.contribute("resource-browser", provider);
    }
  },
});

export const altairWebGalPlugin = createAltairWebGalPlugin();

export * from "./webgal";
export * from "./authoring";
export * from "./services";
export * from "./resources";
export * from "./resource-browser";
export * from "./workspace";
export default altairWebGalPlugin;
