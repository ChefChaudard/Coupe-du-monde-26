"use client";

import type { ScoreReportRow } from "./leaderboard-data";
import { formatOneDecimal } from "./format";

type ReportSection = {
  key: string;
  title: string;
  subtitle: string;
  items: ScoreReportRow[];
};

type ReportPhaseGroup = {
  phase: string;
  items: ScoreReportRow[];
};

type TopScorerReportItem = ScoreReportRow & {
  kind: "topScorer";
  player: string;
  participants: number;
  predictedCount: number;
};

function isTopScorerReportItem(item: ScoreReportRow): item is TopScorerReportItem {
  return (item as { kind: string }).kind === "topScorer";
}

function getReportSectionKey(item: ScoreReportRow) {
  const kind = (item as { kind: string }).kind;

  if (kind === "groupPlacement") return "groupPlacement";
  if (kind === "topScorer") return "topScorer";

  const normalizedPhase = item.phase.toLowerCase();

  if (normalizedPhase.includes("reel") || normalizedPhase.includes("réel") || normalizedPhase.includes("real")) {
    return "realKnockout";
  }

  if (normalizedPhase.includes("group")) return "groupMatches";

  return "knockoutQualification";
}

export function getReportSections(reportRows: ScoreReportRow[]): ReportSection[] {
  const sectionMap = new Map<string, ReportSection>();

  const sections: ReportSection[] = [
    {
      key: "groupMatches",
      title: "Match groupes",
      subtitle: "Points gagnés sur les matchs de groupe.",
      items: [],
    },
    {
      key: "groupPlacement",
      title: "Classement groupe",
      subtitle: "Points gagnés sur le classement final du groupe.",
      items: [],
    },
    {
      key: "knockoutQualification",
      title: "Qualifiés dans les tours",
      subtitle: "Points gagnés sur les tours à élimination directe.",
      items: [],
    },
    {
      key: "topScorer",
      title: "Meilleur buteur",
      subtitle: "Points gagnés sur la sélection du meilleur buteur.",
      items: [],
    },
    {
      key: "realKnockout",
      title: "Matchs reels du 2eme tour",
      subtitle: "Points gagnés sur les matchs réels du second tour.",
      items: [],
    },
  ];

  for (const section of sections) {
    sectionMap.set(section.key, section);
  }

  for (const item of reportRows) {
    const section = sectionMap.get(getReportSectionKey(item));
    if (section) section.items.push(item);
  }

  return sections.filter((section) => section.items.length > 0);
}

// Nombre total d'équipes en lice à chaque tour à élimination directe
// (ex: 16e de finale = 16 matchs = 32 équipes). Sert à afficher
// "X équipes qualifiées / Y" dans le report détaillé.
const KNOCKOUT_ROUND_TEAM_COUNTS: Record<string, number> = {
  "16e de finale": 32,
  "8e de finale": 16,
  "Quarts de finale": 8,
  "Demi-finales": 4,
  Finale: 2,
};

const TOTAL_KNOCKOUT_TEAMS = Object.values(KNOCKOUT_ROUND_TEAM_COUNTS).reduce(
  (sum, count) => sum + count,
  0
);

function groupMatchReportItemsByPhase(items: ScoreReportRow[]): ReportPhaseGroup[] {
  const groups = new Map<string, ScoreReportRow[]>();

  for (const item of items) {
    const phaseItems = groups.get(item.phase) ?? [];
    phaseItems.push(item);
    groups.set(item.phase, phaseItems);
  }

  return Array.from(groups.entries())
    .map(([phase, phaseItems]) => ({
      phase,
      items: phaseItems,
    }))
    .sort((a, b) => a.phase.localeCompare(b.phase));
}

function ReportItemContext({ item }: { item: ScoreReportRow }) {
  if (item.kind === "match") {
    return (
      <div className="text-xs text-slate-600">
        <p>
          {item.predictedScore} / {item.actualScore}
        </p>
      </div>
    );
  }

  if (item.kind === "groupPlacement") {
    return (
      <div className="text-xs text-slate-600">
        <p>
          {item.predictedCount} joueurs sur {item.participants}
        </p>
      </div>
    );
  }

  if (isTopScorerReportItem(item)) {
    return (
      <div className="text-xs text-slate-600">
        <p>{item.player} - meilleur buteur</p>
        <p className="mt-0.5 text-slate-500">
          sélection du meilleur buteur de la Coupe du monde
        </p>
        <p className="mt-0.5 text-slate-500">
          {item.predictedCount}/{item.participants} joueurs sur ce choix
        </p>
      </div>
    );
  }

  if (item.kind === "knockoutPlacement") {
    return (
      <div className="text-xs text-slate-600">
        <p>
          {item.predictedCount} joueurs sur {item.participants}
        </p>
      </div>
    );
  }

  return null;
}

function ReportItemRow({ item, withTopBorder }: { item: ScoreReportRow; withTopBorder: boolean }) {
  return (
    <div
      className={`grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1.3fr_0.9fr_0.7fr_0.7fr] sm:items-center ${
        withTopBorder ? "border-t border-slate-100" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{item.label}</p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:contents">
        <ReportItemContext item={item} />

        <div className="flex shrink-0 items-center gap-3 sm:contents">
          <div className="text-right text-xs font-medium text-slate-700">
            x{formatOneDecimal(item.odds)}
          </div>

          <div className="text-right text-sm font-semibold text-slate-900">
            +{formatOneDecimal(item.points)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScoreReportDetails({
  reportRows,
  sectionKey,
}: {
  reportRows: ScoreReportRow[];
  sectionKey?: string;
}) {
  const allSections = getReportSections(reportRows);
  const sections = sectionKey
    ? allSections.filter((section) => section.key === sectionKey)
    : allSections;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-[1.3fr_0.9fr_0.7fr_0.7fr]">
        <div>Événement</div>
        <div>Contexte</div>
        <div className="text-right">Cote</div>
        <div className="text-right">Points</div>
      </div>

      <div className="space-y-4">
        {sections.length ? (
          sections.map((section) => {
            const sectionPoints = section.items.reduce((sum, item) => sum + item.points, 0);
            const isPhaseGrouped =
              section.key === "groupMatches" ||
              section.key === "groupPlacement" ||
              section.key === "knockoutQualification" ||
              section.key === "realKnockout";
            const isKnockoutQualification = section.key === "knockoutQualification";
            const totalTeamsFound = isKnockoutQualification ? section.items.length : null;

            return (
              <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-200 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{section.subtitle}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {totalTeamsFound !== null ? (
                      <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900">
                        {totalTeamsFound}/{TOTAL_KNOCKOUT_TEAMS} équipes
                      </div>
                    ) : null}
                    <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900">
                      {formatOneDecimal(sectionPoints)} pts
                    </div>
                  </div>
                </div>

                <div>
                  {isPhaseGrouped ? (
                    <div className="space-y-4">
                      {groupMatchReportItemsByPhase(section.items).map((phaseGroup) => {
                        const phasePoints = phaseGroup.items.reduce((sum, item) => sum + item.points, 0);
                        const groupLabel =
                          section.key === "groupPlacement"
                            ? "Points cumulés sur ce classement."
                            : section.key === "knockoutQualification"
                              ? "Points cumulés sur ce tour."
                              : section.key === "realKnockout"
                                ? "Points cumulés sur ce tour réel."
                                : "Points cumulés sur ce groupe.";
                        const roundTeamCount =
                          section.key === "knockoutQualification"
                            ? KNOCKOUT_ROUND_TEAM_COUNTS[phaseGroup.phase]
                            : undefined;

                        return (
                          <div key={phaseGroup.phase} className="border-t border-slate-100 first:border-t-0 first:pt-0 pt-4">
                            <div className="mb-2 flex items-start justify-between gap-4 px-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{phaseGroup.phase}</p>
                                <p className="text-xs text-slate-500">{groupLabel}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {roundTeamCount ? (
                                  <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900">
                                    {phaseGroup.items.length}/{roundTeamCount} équipes
                                  </div>
                                ) : null}
                                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-900">
                                  {formatOneDecimal(phasePoints)} pts
                                </div>
                              </div>
                            </div>

                            <div className="space-y-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                              {phaseGroup.items.map((item, index) => (
                                <ReportItemRow key={item.reportId} item={item} withTopBorder={index > 0} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    section.items.map((item, index) => (
                      <ReportItemRow key={item.reportId} item={item} withTopBorder={index > 0} />
                    ))
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
            {sectionKey ? "Aucun point acquis dans cette catégorie." : "Aucun point acquis pour ce joueur."}
          </p>
        )}
      </div>

      {sections.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Chaque ligne correspond à un point gagné et affiche la cote appliquée ainsi que le total obtenu.
        </div>
      ) : null}
    </div>
  );
}
