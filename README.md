# Altair WebGAL

Altair WebGAL opens [WebGAL](https://github.com/OpenWebGAL/WebGAL) projects in
the [Altair](https://github.com/haneoka-gakuen/altair) editor — whole project
folders, single scene files, or WebGAL Craft projects — and writes them back
without losing a byte you did not touch. Dialogue, figures, backgrounds,
music, choices, scene calls and transforms become editable commands with
proper forms; the transform, Pixi-perform, colour-matrix, weather and filter
commands get dedicated visual editors; and anything Altair does not
understand, including third-party extension commands, is carried through
untouched.

Because the commands are mapped onto Vega's ADV command set, the same project
can be previewed and played in [Vega](https://github.com/haneoka-gakuen/vega)
as well as exported back to WebGAL.

## Install

```sh
pnpm add @haneoka/altair @haneoka/altair-plugin-adv @haneoka/altair-plugin-webgal
```

Requires Altair ADV (`haneoka.altair-adv ^0.1.0`). ESM only.

## Use it in Altair

```ts
import { AltairPluginHost } from "@haneoka/altair/plugins";
import { altairAdvPlugin } from "@haneoka/altair-plugin-adv";
import { altairWebGalPlugin } from "@haneoka/altair-plugin-webgal";

const host = new AltairPluginHost();
await host.install(altairAdvPlugin);
await host.install(altairWebGalPlugin);

const { project, diagnostics } = await host.importFormat(
  { files: workspaceFiles, entryPath: "game/scene/start.txt" },
  "webgal",
);
```

To browse the project's own `game/` folders for backgrounds, figures, audio
and videos, create the plugin with the workspace files:

```ts
import { createAltairWebGalPlugin } from "@haneoka/altair-plugin-webgal";

await host.install(createAltairWebGalPlugin({ resourceFiles: workspaceFiles }));
```

The plugin (`haneoka.altair-webgal`) contributes:

| Contribution | What it does |
| --- | --- |
| Format `webgal` | `.txt`, `.wg` and `.webgal` scenes and complete WebGAL project folders. |
| Format `webgal-craft` | WebGAL Craft projects (`project.wgcp`). |
| Validator `webgal-fidelity` | Warns about commands that convert approximately (`webgal.approximate`) or are only preserved (`webgal.preserved-only`). |
| Command schemas | Every built-in WebGAL command, editable in its original form. |
| Editors | Visual editors for `setTransform` and `pixiPerform`, a filter-preset panel, and colour-matrix and weather fields. |
| Resource browser | Only with `resourceFiles`: the project's asset folders, with previews. |
| Service `ALTAIR_WEBGAL_SERVICE` | Import, export, scene merge and workspace helpers. |

## Round trips without loss

Altair keeps two things for every WebGAL statement: the command Vega
understands, when there is one, and the original line with its arguments and
position. As a result:

- A scene you open and save without changes is written back byte for byte.
- Editing one command rewrites only that statement; comments, spacing and
  neighbouring lines stay as they were.
- When one WebGAL statement expands into several Vega commands, they share one
  source, and an untouched export writes the statement once.

Every converted statement is graded `exact`, `approximate`, `preserved-only`
(kept and exported, but not played by Vega) or `unsupported`. The validator
turns the last three into editor warnings.

### Extension commands

WebGAL treats any unknown word followed by `:` as a speaker name. That is
handy for dialogue but would turn a third-party command into a line of
dialogue. Altair therefore treats namespaced forms (`@vendor/name`,
`vendor.command`, `vendor/command`) as opaque commands automatically. For
plain custom names, pass them in when importing:

```ts
await host.importFormat({ ...request, options: { additionalCommandNames: ["myEffect", "showMap"] } }, "webgal");
```

Opaque commands are kept verbatim, never sent to Vega, and reported as
`preserved-only`.

### Haneoka-only commands in WebGAL files

To edit Vega-only commands through a WebGAL file and get them back later,
export with `losslessMetadata: "scene"` (one scene) or `"project"` (a
self-contained interchange file). The extra data is stored in ordinary WebGAL
comments, so the file still opens in WebGAL — but WebGAL itself cannot run
those commands.

## How visual commands map

The details are in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md). In short:

- `setTransform` alpha, brightness, blur and position become Vega's Alpha,
  Brightness, depth-of-field and Move commands. Position is converted from
  WebGAL's 1920 × 1080 stage offsets.
- Stock animations (`enter`, `exit`, `shake`, `blur`, `enter-from-*`) and
  `setTempAnimation` with those properties become Vega timelines.
- `setTextbox:hide`/`on`, `universalSoftIn`/`Off` and `testblur` have direct
  counterparts.
- Scale, rotation, colour channels, bloom, bevel, film, shockwave, weather and
  similar Pixi filters stay in the source and are reported; a WebGAL-compatible
  runtime plugin is needed to play them.

Character targets are WebGAL's three figure slots or ids from an earlier
`changeFigure`; unknown targets are never guessed.

## Without the editor

| Path | Contents |
| --- | --- |
| `/codec` | `importWebGal(text, options)`, `serializeWebGalText(project, options)` and the scene-level codec. |
| `/workspace` | Folder import/export, path classification, source files of a workspace. |
| `/craft` | WebGAL Craft project import. |
| `/authoring` | Starter documents, source documents and the authoring profile. |
| `/resources`, `/resource-browser` | Asset references and the resource browser. |
| `/services` | `ALTAIR_WEBGAL_SERVICE` and the service object. |

```ts
import { importWebGal, serializeWebGalText } from "@haneoka/altair-plugin-webgal/codec";

const { project, diagnostics } = importWebGal(sceneText, { additionalCommandNames: ["myEffect"] });
const text = serializeWebGalText(project);
```

## What is not included

No WebGAL engine, WebGAL Terre editor, game assets, character models or
Live2D components. WebGAL is a separate project under its own licence.

## License

MPL-2.0. See [LICENSE](LICENSE).
