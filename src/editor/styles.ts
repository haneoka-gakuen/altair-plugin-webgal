export const WEBGAL_EDITOR_CSS = String.raw`
@layer pages {
  .visual-filter-editor { grid-column: 1 / -1; display: grid; gap: var(--md-sys-spacing-3); min-inline-size: 0; color: var(--md-sys-color-on-surface); font-family: var(--app-font); }
  .visual-filter-editor summary { display: flex; align-items: center; min-block-size: 48px; cursor: pointer; font-size: var(--md-sys-typescale-label-large-size); }
  .visual-filter-editor > details > summary { color: var(--md-sys-color-on-surface-variant); font-weight: var(--md-sys-typescale-label-large-weight); }
  .visual-filter-switches, .visual-filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--md-sys-spacing-3); padding-block: var(--md-sys-spacing-2); }
  .visual-filter-switches label { display: flex; align-items: center; gap: var(--md-sys-spacing-2); min-block-size: 48px; font-size: var(--md-sys-typescale-label-large-size); }
  .visual-filter-switches input { inline-size: auto !important; }
  .visual-filter-grid label { display: flex; flex-direction: column; gap: var(--md-sys-spacing-2); min-inline-size: 0; font-size: var(--md-sys-typescale-label-large-size); }
  .visual-filter-editor :is(button, select, input:not([type=checkbox])) { min-block-size: 48px; min-inline-size: 0; max-inline-size: 100%; box-sizing: border-box; }
  .visual-preset-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--md-sys-spacing-2); }
  .visual-preset-actions label[role=button] { cursor: pointer; display: flex; align-items: center; gap: var(--md-sys-spacing-2); min-block-size: 48px; border: 1px solid var(--md-sys-color-outline-variant); padding-inline: var(--md-sys-spacing-4); border-radius: var(--md-sys-shape-corner-full); font-size: var(--md-sys-typescale-label-large-size); }
  .color-matrix-editor { display: flex; flex-direction: column; gap: var(--md-sys-spacing-3); min-inline-size: 0; }
  .color-matrix-grid { overflow: auto; }
  .color-matrix-grid table { border-collapse: collapse; inline-size: 100%; font-size: var(--md-sys-typescale-label-large-size); }
  .color-matrix-grid caption { text-align: start; color: var(--md-sys-color-on-surface-variant); padding-block: var(--md-sys-spacing-2); }
  .color-matrix-grid th { padding: var(--md-sys-spacing-2); font-weight: var(--md-sys-typescale-label-large-weight); }
  .color-matrix-grid td { padding: var(--md-sys-spacing-1); }
  .color-matrix-grid input { inline-size: 64px; min-block-size: 48px; padding: var(--md-sys-spacing-2); font-size: inherit; }
  .color-matrix-editor [role=alert] { color: var(--md-sys-color-error); }
  @media (max-width: 599px) { .visual-filter-grid { grid-template-columns: minmax(0, 1fr); } }
}
`;
