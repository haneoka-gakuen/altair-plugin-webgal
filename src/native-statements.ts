import { importedStoryId, type JsonValue, type StoryProjectCommand } from "@haneoka/altair/model";
import {
  COMMAND_DESCRIPTORS,
  commandDescriptor,
  createStoryCommand,
  storyCommandFieldValue,
  replaceStoryCommandFieldValue,
  type CommandFieldDescriptor,
} from "@haneoka/altair-plugin-adv/commands";
import type { WebGalStatement } from "./webgal.js";

const aliases: Record<string, string> = {
  Stage: "bg",
  Character: "cast",
  In: "enter",
  Out: "exit",
  Motion: "motion",
  Expression: "face",
  Look: "look",
  MoveToDirection: "move",
  Focus: "camera",
  Bgm: "bgm",
  Se: "se",
  Voice: "voice",
  PostEffect: "fx",
  Delay: "wait",
  FadeOut: "fade",
  FadeIn: "reveal",
  Costume: "costume",
  Angle: "pose",
};
const fieldAliases: Record<string, string> = { duration: "dur", delay: "delay", targetName: "target", easing: "ease" };
const definitions = new Map(
  COMMAND_DESCRIPTORS.flatMap((definition) => [
    [`adv.${definition.name.toLowerCase()}`, definition] as const,
    ...(aliases[definition.name] ? [[aliases[definition.name]!, definition] as const] : []),
  ]),
);
export const NATIVE_STATEMENT_NAMES = [...definitions.keys()];
export function nativeScriptLanguage() {
  return [...definitions]
    .filter(([, definition]) => definition.name !== "Talk" && definition.name !== "CommandGroup")
    .map(([name, definition]) => {
      const command = createStoryCommand(definition.name);
      return {
        name,
        label: definition.name,
        text: serializeNativeStatement(command)!.replace(/^[^:]+/u, name),
        fields: definition.fields.map((field) => ({
          name: keyFor(field),
          text: `-${keyFor(field)}=${encode(storyCommandFieldValue(command, field) ?? "")}`,
        })),
      };
    });
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function encode(value: JsonValue): string {
  return JSON.stringify(value);
}
function decode(value: string | true, field: CommandFieldDescriptor): JsonValue {
  if (value === true) {
    if (field.kind !== "boolean") throw new TypeError(`A value is required for ${field.key}`);
    return true;
  }
  if (
    field.kind === "number" ||
    (field.kind === "select" && field.choices?.every((choice) => typeof choice.value === "number"))
  ) {
    const number = Number(value);
    if (!value.trim() || !Number.isFinite(number)) throw new TypeError(`Invalid number for ${field.key}`);
    return number;
  }
  if (field.kind === "boolean") {
    if (value !== "true" && value !== "false") throw new TypeError(`Invalid boolean for ${field.key}`);
    return value === "true";
  }
  if (["resource-list", "localized-list", "vector3", "multi-select", "choice-list"].includes(field.kind))
    return JSON.parse(value) as JsonValue;
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}
const keyFor = (field: CommandFieldDescriptor) => fieldAliases[field.key] ?? field.key;

/** Native fields share their schema with the inspector, including native parameter slots. */
export function parseNativeStatement(statement: WebGalStatement): StoryProjectCommand | undefined {
  const definition = definitions.get(statement.name);
  if (!definition || statement.kind !== "command") return;
  let command = createStoryCommand(definition.name);
  command = { ...command, id: importedStoryId("native-script", statement.line, 0), extensions: {} };
  const primary = definition.fields.find((field) => field.key === definition.primaryField);
  if (statement.escapedContent) {
    if (!primary) throw new TypeError(`Use named fields for ${statement.name}`);
    const raw = statement.escapedContent;
    const value =
      primary.kind === "text" || primary.kind === "resource" || primary.kind === "localized-text"
        ? raw.startsWith('"')
          ? (JSON.parse(raw) as JsonValue)
          : statement.content
        : decode(raw, primary);
    command.fields = replaceStoryCommandFieldValue(command.fields, primary, value);
  }
  const seen = new Set<string>();
  for (const argument of statement.arguments) {
    const field = definition.fields.find(
      (field) =>
        field.key.toLowerCase() === argument.name.toLowerCase() ||
        keyFor(field).toLowerCase() === argument.name.toLowerCase(),
    );
    if (!field) throw new TypeError(`Unknown ${statement.name} field: ${argument.name}`);
    if (seen.has(field.key)) throw new TypeError(`Duplicate ${statement.name} field: ${argument.name}`);
    seen.add(field.key);
    command.fields = replaceStoryCommandFieldValue(command.fields, field, decode(argument.value, field));
  }
  return command;
}

export function serializeNativeStatement(command: StoryProjectCommand): string | undefined {
  const definition = commandDescriptor(command.command);
  if (!definition || definition.name === "Talk" || definition.name === "CommandGroup") return;
  const primary = definition.fields.find((field) => field.key === definition.primaryField);
  const defaults = createStoryCommand(definition.name);
  const content = primary ? storyCommandFieldValue(command, primary) : undefined;
  const options = definition.fields.flatMap((field) => {
    if (field === primary) return [];
    const value = storyCommandFieldValue(command, field);
    const fallback = storyCommandFieldValue(defaults, field);
    if (value === undefined || same(value, fallback)) return [];
    return [`-${keyFor(field)}=${encode(value)}`];
  });
  return `${aliases[definition.name] ?? `adv.${definition.name}`}:${content === undefined || content === "" ? "" : encode(content)}${options.length ? " " + options.join(" ") : ""};`;
}
