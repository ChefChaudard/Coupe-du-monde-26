export function isGroupPhase(phase: string) {
  const normalized = phase.toLowerCase();
  return normalized.includes("group") || normalized.includes("phase de ligue");
}