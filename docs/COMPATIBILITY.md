# WebGAL compatibility

## Fidelity policy

Altair stores two things separately:

- the semantic command understood by Vega, when an equivalent exists;
- the original WebGAL line, arguments, source location, and codec sidecar.

This prevents editor conveniences from destroying source syntax. Import and
export diagnostics use `exact`, `approximate`, `preserved-only`, or
`unsupported`.

## Unknown commands

WebGAL convention treats an unregistered token as a speaker. That behavior is
convenient for dialogue but unsafe for third-party commands.

Altair automatically treats namespaced forms (`@vendor/name`,
`vendor.command`, or `vendor/command`) as opaque commands. Plain custom names
must be supplied in `additionalCommandNames`:

```ts
const result = importWebGal(text, {
  additionalCommandNames: installedPlugins.flatMap((plugin) => plugin.webGalCommands),
});
```

An opaque command has `command: null`, keeps its raw line, is excluded from Vega
runtime compilation, and produces a preserved-only diagnostic. It is emitted
verbatim even when neighboring commands change.

## Untouched source

Plain WebGAL import records the original source plus command/comment baselines.
If commands and comments are unchanged and the caller did not request another
line ending or metadata envelope, export returns the original bytes.

For editing Haneoka-only semantics through a WebGAL projection, use:

- `losslessMetadata: "scene"` for a scene editing round trip;
- `losslessMetadata: "project"` for a self-contained interchange file.

The metadata is ordinary WebGAL comments, but consumers must not claim a plain
WebGAL engine can execute the embedded Haneoka-only commands.

## Visual commands

| WebGAL command | Vega projection | Fidelity |
| --- | --- | --- |
| `setTransform` character `alpha` | `Alpha` (55) | approximate |
| `setTransform` character/background `brightness` | `Brightness` (12) | approximate |
| `setTransform` character/background `blur` | `DoF` (49) | approximate |
| `setTransform` character `position` | `MoveToDirection` (64) | approximate |
| `setTransform -writeDefault` portable defaults | concurrent `Alpha` (55), `Brightness` (12), `DoF` (49), and `MoveToDirection` (64) resets | approximate |
| `setTempAnimation` with the properties above | `Timeline` (45) containing native commands | approximate |
| stock `setAnimation:enter-from-*`, `shake`, `enter`, `exit`, or `blur` | `Timeline` (45) containing portable native commands | approximate |
| `setTransition` using one of those stock presets on a figure target | zero-duration state marker plus a native timeline on the following figure change | approximate |
| `setComplexAnimation:universalSoftIn` / `universalSoftOff` | `Alpha` (55) | approximate |
| `setComplexAnimation:testblur` | `Alpha` (55) and `DoF` (49) | approximate |
| unknown complex animation presets | none; raw statement retained | preserved-only |
| `setTextbox:hide` | empty `Talk` (2), which clears the native talk surface without a backlog entry | approximate |
| `setTextbox:on` | zero-duration `Delay` (3); following `Talk` commands display normally | approximate |

Character targets are the three WebGAL figure slots or IDs introduced by an
earlier `changeFigure`. Unknown targets are not guessed. Position values are
converted from WebGAL's 1920 × 1080 stage offsets to Vega's native character
movement units and tracked between statements. The result remains approximate
because target geometry, easing, cancellation, `keep`, `parallel`, and
WebGAL-specific filter composition do not have identical ADV semantics.

The following transform properties remain in source metadata and diagnostics:
scale, rotation, contrast, saturation, gamma, color channels, bloom, bevel,
film filters, shockwave, and radius-alpha. A statement with at least one safe
native property executes that subset and reports the rest as source-only. A
statement with no safe native property is preserved-only.

`-writeDefault` resets every WebGAL/Pixi transform channel to `baseTransform`.
Vega resets only the four channels listed above. Scale, rotation, color, and
filter defaults remain source-only.

`move-front-and-back` is defined by figure scale, and the film, shockwave, and
weather presets are defined by Pixi filters/effects. They remain
preserved-only. Project animation JSON, `-keep` lifetimes, Pixi cancellation,
and filter composition also require a WebGAL-compatible runtime plugin.

`TalkWindow` (35) selects a Vega dialogue-window style and is not used for
textbox visibility. Native empty `Talk` clears the current surface, but
`setTextbox:on` cannot resurrect the previous text; it restores visibility for
the next dialogue instead.

When one WebGAL statement expands into several native commands, all generated
commands share one source identity. An untouched export emits the original
statement exactly once.

## Choice escapes

Choice alternatives and their `text:target` delimiter are split before
WebGAL's display escapes are resolved. Escaped `\|`, `\:`, `\,`, `\.`, and
`\;` therefore remain display text and cannot accidentally create a branch or
scene edge. A choice without an unescaped target delimiter remains
preserved-only.

## Scene paths

`callScene` and `changeScene` targets use the same stable form as Altair
workspace IDs:

- slash direction is normalized;
- leading relative markers and path dot-segments are resolved;
- `.txt`, `.wg`, and `.webgal` are removed;
- path components are Unicode-normalized and unsafe separators become `-`.

The authored path remains in `sourceScene` and in the original source line for
round trips. WebGAL resolves bare targets from the scene root, not relative to
the calling scene, so `callScene:ending.txt` maps to root scene `ending` even
inside `routes/current.txt`. Explicit `scene/` and `game/scene/` prefixes are
also accepted and stripped for folder-import compatibility.

## Workspace boundary

The API 2 format contribution accepts all files from a WebGAL project in one
request. Standard `game/scene/**` sources become scenes; `config.txt` and
binary assets are not decoded as scripts. Paths are canonical, relative, and
traversal-free. File count, scene count, aggregate bytes, per-scene bytes, and
path length are bounded before parsing.

Scene IDs retain the directory below the nearest `scene` segment, so
`scene/routes/ending.txt` maps to `routes/ending` and resolves an authored
`callScene:routes/ending.txt`. The conventional root `start` scene is the
entry unless the request supplies an explicit scene entry.

Every diagnostic is qualified with its source path. Assets and safe project
extensions are merged, and duplicate command IDs are deterministically
qualified by scene. The `altair:workspace.sourcePaths` extension records the
canonical mapping used to emit one artifact per scene on export.
