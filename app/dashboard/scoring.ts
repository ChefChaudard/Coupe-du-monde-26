export type MatchOdds = {
  one: number;
  draw: number;
  two: number;
};

export type PredictionMatch = {
  predicted_a: number;
  predicted_b: number;
};

function normalizeSelection(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export const TOP_SCORER_POINTS = 20;

export function getTopScorerPoints(predictedPlayer: string | null, actualPlayer: string | null) {
  if (!predictedPlayer || !actualPlayer) return 0;

  return normalizeSelection(predictedPlayer) === normalizeSelection(actualPlayer)
    ? TOP_SCORER_POINTS
    : 0;
}

export function getPhasePointBase(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return 1;
  if (normalizedPhase.includes("32e")) return 1;
  if (
    normalizedPhase.includes("16e") ||
    normalizedPhase.includes("8e") ||
    normalizedPhase.includes("quart")
  ) {
    return 2;
  }
  if (normalizedPhase.includes("demi") || normalizedPhase.includes("finale")) {
    return 3;
  }
  if (normalizedPhase.includes("vainqueur")) return 4;

  return 1;
}

export function computeMatchOdds(matchPredictions: PredictionMatch[]): MatchOdds {
  const counts = {
    one: 0,
    draw: 0,
    two: 0,
  };

  for (const prediction of matchPredictions) {
    if (prediction.predicted_a > prediction.predicted_b) {
      counts.one += 1;
    } else if (prediction.predicted_a < prediction.predicted_b) {
      counts.two += 1;
    } else {
      counts.draw += 1;
    }
  }

  const total = counts.one + counts.draw + counts.two;

  if (total === 0) {
    return { one: 1, draw: 1, two: 1 };
  }

  const toOdds = (count: number) => {
    const raw = total / Math.max(count, 1);
    return Math.max(1, Math.round(raw * 100) / 100);
  };

  return {
    one: toOdds(counts.one),
    draw: toOdds(counts.draw),
    two: toOdds(counts.two),
  };
}

export function getPredictionPoints(
  predictedA: number,
  predictedB: number,
  actualA: number | null,
  actualB: number | null,
  isFinished: boolean | null,
  phase: string,
  odds: MatchOdds
) {
  if (!isFinished || actualA === null || actualB === null) return 0;

  const base = getPhasePointBase(phase);
  const predictedOutcome =
    predictedA > predictedB ? "A" : predictedA < predictedB ? "B" : "D";
  const actualOutcome =
    actualA > actualB ? "A" : actualA < actualB ? "B" : "D";

  if (predictedOutcome !== actualOutcome) return 0;

  const multiplier =
    predictedOutcome === "A"
      ? odds.one
      : predictedOutcome === "B"
        ? odds.two
        : odds.draw;

  return Math.max(1, Math.round(base * multiplier * 100) / 100);
}