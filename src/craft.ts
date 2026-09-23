import type { AltairFormatRequest, AltairFormatImportResult, AltairSourceFile } from "@haneoka/altair/protocol";
import { materializeWebGalCraftWorkspace } from "./craft-model.js";
import { importWebGalWorkspace } from "./workspace.js";
import type { ImportWebGalOptions } from "./webgal.js";
export * from "./craft-model.js";

export async function importWebGalCraftWorkspace(
  request: AltairFormatRequest & {
    readonly signal: AbortSignal;
    readonly engineFiles?: readonly AltairSourceFile[];
    readonly templateFiles?: readonly AltairSourceFile[];
  },
  options: ImportWebGalOptions = {},
): Promise<AltairFormatImportResult> {
  const view = materializeWebGalCraftWorkspace({
    project: request.files,
    ...(request.engineFiles ? { engine: request.engineFiles } : {}),
    ...(request.templateFiles ? { template: request.templateFiles } : {}),
  });
  const descriptor = request.files.find((file) => file.path === "project.wgcp");
  const { entryPath, ...rest } = request;
  const result = await importWebGalWorkspace(
    {
      ...rest,
      files: [...view.files, ...(descriptor ? [descriptor] : [])],
      ...(entryPath && entryPath !== "project.wgcp" ? { entryPath } : {}),
    },
    options,
  );
  return {
    ...result,
    format: "webgal-craft",
    project: {
      ...result.project,
      extensions: {
        ...result.project.extensions,
        webgalCraft: {
          config: JSON.parse(JSON.stringify(view.config)),
          configPath: "project.wgcp",
          missingDependencies: [...view.missingDependencies],
        },
      },
    },
  };
}
