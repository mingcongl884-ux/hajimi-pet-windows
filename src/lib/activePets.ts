export const MAX_ACTIVE_PETS = 2;

export function normalizeActivePetIds(activePetIds: string[] | undefined, fallbackPetId: string): string[] {
  const unique = [...new Set((activePetIds?.length ? activePetIds : [fallbackPetId]).filter(Boolean))];
  return unique.length > 0 ? unique.slice(0, MAX_ACTIVE_PETS) : [fallbackPetId];
}

export function toggleActivePetId(activePetIds: string[], petId: string): string[] {
  if (activePetIds.includes(petId)) {
    return activePetIds.length <= 1 ? activePetIds : activePetIds.filter((id) => id !== petId);
  }
  const next = [...activePetIds, petId];
  return next.length > MAX_ACTIVE_PETS ? next.slice(next.length - MAX_ACTIVE_PETS) : next;
}
