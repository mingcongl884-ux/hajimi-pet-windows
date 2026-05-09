import type { AnimationState } from "./atlas.js";

export interface PetManifest {
  id?: string;
  name?: string;
  displayName?: string;
  description?: string;
  spritesheetPath?: string;
  animationFrameCounts?: Partial<Record<AnimationState, number>>;
  [key: string]: unknown;
}

export interface ImportedPetBundle {
  petId: string;
  manifest: PetManifest;
  destinationDir: string;
  replaced: boolean;
}

export type PetImportErrorCode =
  | "SOURCE_NOT_FOUND"
  | "UNSUPPORTED_SOURCE"
  | "INVALID_BUNDLE"
  | "UNSAFE_ZIP_ENTRY"
  | "INVALID_PET_JSON"
  | "INVALID_PET_ID"
  | "INVALID_SPRITESHEET"
  | "INVALID_SPRITESHEET_DIMENSIONS"
  | "DUPLICATE_PET";

export interface PetImportErrorDetails {
  code: PetImportErrorCode;
  message: string;
  petId?: string;
  path?: string;
}

export interface InstalledPet {
  id: string;
  displayName: string;
  description?: string;
  manifest: PetManifest;
  spritesheetUrl: string;
}
