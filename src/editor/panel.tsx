import { useSyncExternalStore } from "react";
import {
  parseAltairSceneDocument,
  type AltairAuthoredNode,
  type AltairPanelContext,
  type JsonObject,
  type JsonValue,
} from "@haneoka/altair/documents";
import { mountReactEditor, useEditorWorkspace } from "@haneoka/altair-ui-react";
import { ColorMatrixFields } from "./ColorMatrixFields.js";
import { WeatherFields } from "./WeatherFields.js";
import { TransformFields } from "./TransformFields.js";
import { WEBGAL_EDITOR_CSS } from "./styles.js";

const findNode = (nodes: readonly AltairAuthoredNode[], id: string): AltairAuthoredNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children ?? [], id);
    if (child) return child;
  }
  return undefined;
};
function Field({ selection, editor }: { selection: JsonObject; editor: string }) {
  const workspace = useEditorWorkspace(),
    snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const path = String(selection.path),
    field = String(selection.field),
    document = snapshot.documents.find((document) => document.path === path);
  let node: AltairAuthoredNode | undefined;
  try {
    if (document) node = findNode(parseAltairSceneDocument(document.text).nodes, String(selection.nodeId));
  } catch {
    return null;
  }
  if (!node) return null;
  const value = node.arguments[field] ?? null,
    props = { value, onChange: (value: JsonValue) => workspace.editArgument(node!.id, field, value, path) };
  return (
    <>
      <style>{WEBGAL_EDITOR_CSS}</style>
      {editor === "transform" ? (
        <TransformFields {...props} session={workspace} />
      ) : value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        ["color-matrix", "clear-color-matrix"].includes(String(value.action)) ? (
        <ColorMatrixFields {...props} />
      ) : (
        <WeatherFields {...props} />
      )}
    </>
  );
}
export const mountWebGalField = (host: HTMLElement, context: AltairPanelContext, editor: string) =>
  mountReactEditor(host, context, <Field selection={context.selection ?? {}} editor={editor} />);
