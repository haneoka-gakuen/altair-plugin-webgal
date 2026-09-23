import type { JsonObject } from "@haneoka/altair/model";
const value = (config: JsonObject, key: string): unknown =>
  Object.entries(config).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
const dimension = (input: unknown, fallback: number): number => {
  const number = Number(input);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};
export function webGalStageSize(config: JsonObject = {}): readonly [number, number] {
  return [dimension(value(config, "Stage_Width"), 2560), dimension(value(config, "Stage_Height"), 1440)];
}
export function webGalFigureLayout(position: number, kind: string, config: JsonObject = {}): JsonObject {
  const [width, height] = webGalStageSize(config),
    configured = value(config, "Positioning_Type");
  let mode = configured === undefined ? "M_2_4" : String(configured).trim();
  if (["W_4_5_12", "M_2_3"].includes(mode)) mode = "M_2_3";
  else if (["W_4_5_13", "M_2_4", "M_2_5"].includes(mode)) mode = "M_2_4";
  else if (["BC_1_0_0", "M_3_0_0"].includes(mode)) mode = "M_3_0_0";
  else mode = "M_3_1_0";
  if (["static-portrait", "gif", "video"].includes(kind) || (kind === "jsonl" && mode === "M_3_0_0")) mode = "M_2_4";
  const horizontal = position < 5 ? 0 : position > 5 ? 1 : 0.5;
  const layout: JsonObject = {
    referenceWidth: width,
    referenceHeight: height,
    fit: "contain",
    scale: 1,
    align: [horizontal, 1],
    offset: [0, 0],
  };
  if (mode === "M_2_3")
    Object.assign(layout, {
      scale: 1.5,
      align: [horizontal, 0.5],
      offset: [position === 5 ? 0 : width / 2, height / 3],
    });
  else if (mode === "M_3_0_0" || mode === "M_3_1_0")
    Object.assign(layout, {
      scale: 1.25,
      align: [0.5, 1],
      offset: [position < 5 ? -430 : position > 5 ? 430 : 0, height / 18],
      centerOverflow: true,
    });
  return layout;
}
export function webGalRuntimeLayout(config: JsonObject = {}): JsonObject {
  const [width, height] = webGalStageSize(config),
    aspect = width / height;
  return {
    layout: {
      designViewportAspect: aspect,
      landscapeTargetAspect: aspect,
      portraitTargetAspect: aspect,
    },
    stage: {
      screenReferenceWidth: width,
      screenReferenceHeight: height,
      backgroundFit: "cover",
    },
  };
}
export function webGalFigureProfile(kind: string, config: JsonObject = {}): JsonObject {
  return {
    placement: {
      ...webGalFigureLayout(5, kind, config),
      positions: Object.fromEntries(
        [1, 5, 9].map((position) => [String(position), webGalFigureLayout(position, kind, config)]),
      ),
    },
  };
}
