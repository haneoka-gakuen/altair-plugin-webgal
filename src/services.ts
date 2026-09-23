import { defineAltairService } from "@haneoka/altair/plugins";
import { createWebGalSceneDraft, importWebGal, mergeWebGalScene } from "./webgal";
import {
  classifyWebGalWorkspacePath,
  exportWebGalBrowserWorkspace,
  hydrateWebGalWorkspaceAssetUrls,
  importWebGalBrowserWorkspace,
  webGalWorkspaceResourceInsert,
  webGalWorkspaceSourceFiles,
} from "./resources.js";
import {
  createWebGalAuthoringWorkspaceFile,
  createWebGalSourceDocument,
  createWebGalStarterDocuments,
  exportWebGalSourceDocuments,
  importWebGalSourceDocuments,
  WEBGAL_AUTHORING_PROFILE,
  webGalSourceDocumentFromWorkspaceFile,
  webGalSourceEditorLabel,
  webGalWorkspaceAssetReferences,
} from "./authoring.js";
import { createWebGalResourceBrowserProvider } from "./resource-browser.js";

export interface AltairWebGalService {
  readonly profile: typeof WEBGAL_AUTHORING_PROFILE;
  readonly createWebGalSceneDraft: typeof createWebGalSceneDraft;
  readonly importWebGal: typeof importWebGal;
  readonly mergeWebGalScene: typeof mergeWebGalScene;
  readonly classifyWorkspacePath: typeof classifyWebGalWorkspacePath;
  readonly workspaceSourceFiles: typeof webGalWorkspaceSourceFiles;
  readonly importBrowserWorkspace: typeof importWebGalBrowserWorkspace;
  readonly exportBrowserWorkspace: typeof exportWebGalBrowserWorkspace;
  readonly resourceInsert: typeof webGalWorkspaceResourceInsert;
  readonly hydrateAssetUrls: typeof hydrateWebGalWorkspaceAssetUrls;
  readonly createAuthoringWorkspaceFile: typeof createWebGalAuthoringWorkspaceFile;
  readonly createSourceDocument: typeof createWebGalSourceDocument;
  readonly sourceDocumentFromWorkspaceFile: typeof webGalSourceDocumentFromWorkspaceFile;
  readonly createStarterDocuments: typeof createWebGalStarterDocuments;
  readonly importSourceDocuments: typeof importWebGalSourceDocuments;
  readonly exportSourceDocuments: typeof exportWebGalSourceDocuments;
  readonly workspaceAssetReferences: typeof webGalWorkspaceAssetReferences;
  readonly sourceEditorLabel: typeof webGalSourceEditorLabel;
  readonly createResourceBrowserProvider: typeof createWebGalResourceBrowserProvider;
}

export const ALTAIR_WEBGAL_SERVICE_ID = "haneoka.altair.webgal";

export const ALTAIR_WEBGAL_SERVICE = defineAltairService<AltairWebGalService>(ALTAIR_WEBGAL_SERVICE_ID);

export const altairWebGalService: AltairWebGalService = Object.freeze({
  profile: WEBGAL_AUTHORING_PROFILE,
  createWebGalSceneDraft,
  importWebGal,
  mergeWebGalScene,
  classifyWorkspacePath: classifyWebGalWorkspacePath,
  workspaceSourceFiles: webGalWorkspaceSourceFiles,
  importBrowserWorkspace: importWebGalBrowserWorkspace,
  exportBrowserWorkspace: exportWebGalBrowserWorkspace,
  resourceInsert: webGalWorkspaceResourceInsert,
  hydrateAssetUrls: hydrateWebGalWorkspaceAssetUrls,
  createAuthoringWorkspaceFile: createWebGalAuthoringWorkspaceFile,
  createSourceDocument: createWebGalSourceDocument,
  sourceDocumentFromWorkspaceFile: webGalSourceDocumentFromWorkspaceFile,
  createStarterDocuments: createWebGalStarterDocuments,
  importSourceDocuments: importWebGalSourceDocuments,
  exportSourceDocuments: exportWebGalSourceDocuments,
  workspaceAssetReferences: webGalWorkspaceAssetReferences,
  sourceEditorLabel: webGalSourceEditorLabel,
  createResourceBrowserProvider: createWebGalResourceBrowserProvider,
});
