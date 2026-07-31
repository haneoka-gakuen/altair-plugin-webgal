# Altair WebGAL

Imports, edits, previews, and exports WebGAL projects in Altair.

```sh
pnpm add @haneoka/altair @haneoka/altair-plugin-adv @haneoka/altair-plugin-webgal
```

```ts
await host.install(altairAdvPlugin);
await host.install(altairWebGalPlugin);
const imported = await host.importFormat({
  files: workspaceFiles,
  entryPath: "game/scene/start.txt",
}, "webgal");
```

Folders, unknown commands, and extension commands are retained for export. Compatibility for each command is reported as exact, approximate, preserved-only, or unsupported. See [compatibility](docs/COMPATIBILITY.md).

The package does not include the WebGAL runtime, editor, game assets, character models, or Live2D components.

MPL-2.0.
