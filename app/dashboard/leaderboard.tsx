"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type {
  LeaderboardPayload,
  PhaseDetailRow,
  ScoreBreakdown,
  ScoreReportRow,
} from "./leaderboard-data";
import { formatOneDecimal } from "./format";

const STORAGE_KEY = "activeGroupId";

type LeaderboardRow = LeaderboardPayload["rows"][number];

type LeaderboardRowItemProps = {
  row: LeaderboardRow;
  index: number;
  isSelected?: boolean;
  details?: ScoreBreakdown;
  groupPlacementPoints?: number;
  phaseDetails?: PhaseDetailRow[];
  rowRef?: (element: HTMLDivElement | null) => void;
};

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

function formatOutcomeLabel(outcome: string) {
  if (outcome === "Victoire équipe A") return "victoire A";
  if (outcome === "Victoire équipe B") return "victoire B";
  return "nul";
}

function getReportSectionKey(item: ScoreReportRow) {
  if (item.kind === "groupPlacement") return "groupPlacement";

  const normalizedPhase = item.phase.toLowerCase();

  if (normalizedPhase.includes("reel") || normalizedPhase.includes("réel") || normalizedPhase.includes("real")) {
    return "realKnockout";
  }

  if (normalizedPhase.includes("group")) return "groupMatches";

  return "knockoutQualification";
}

function getReportSections(reportRows: ScoreReportRow[]): ReportSection[] {
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

function getScoreBreakdownLabel(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return "Groupes";
  if (
    normalizedPhase.includes("reel") ||
    normalizedPhase.includes("réel") ||
    normalizedPhase.includes("real")
  ) {
    return "Pronostics réel";
  }

  return "Tours éliminatoires";
}

function createEmptyBreakdown(): ScoreBreakdown {
  return { group: 0, groupPlacement: 0, knockout: 0, real: 0 };
}

function getBreakdownForUser(rows: PhaseDetailRow[]) {
  return rows.reduce<ScoreBreakdown>((acc, row) => {
    const label = getScoreBreakdownLabel(row.phase);

    if (label === "Groupes") {
      acc.group += row.points;
      if (row.phase.toLowerCase().includes("classement")) {
        acc.groupPlacement += row.points;
      }
    } else if (label === "Tours éliminatoires") {
      acc.knockout += row.points;
    } else {
      acc.real += row.points;
    }

    return acc;
  }, createEmptyBreakdown());
}

function getRankBadgeClass(index: number) {
  if (index === 0) return "border-slate-300 bg-slate-100 text-slate-900";
  if (index === 1) return "border-slate-200 bg-white text-slate-700";
  if (index === 2) return "border-slate-200 bg-slate-50 text-slate-700";

  return "border-slate-200 bg-white text-slate-600";
}

function LeaderboardRowItem({
  row,
  index,
  isSelected,
  details,
  groupPlacementPoints,
  phaseDetails,
  rowRef,
}: LeaderboardRowItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isHovered) return;

    const updateTooltipPosition = () => {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;

      if (!anchor || !tooltip || typeof window === "undefined") return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const preferredWidth = Math.min(360, viewportWidth - margin * 2);
      const tooltipWidth = Math.max(280, preferredWidth);
      const maxTooltipHeight = Math.max(160, viewportHeight - margin * 2);
      const tooltipHeight = Math.min(tooltip.offsetHeight || 180, maxTooltipHeight);

      const spaceBelow = viewportHeight - anchorRect.bottom - margin;
      const spaceAbove = anchorRect.top - margin;
      const placeAbove = spaceBelow < tooltipHeight && spaceAbove >= tooltipHeight;

      const top = placeAbove
        ? Math.max(margin, anchorRect.top - tooltipHeight - margin)
        : Math.min(viewportHeight - tooltipHeight - margin, anchorRect.bottom + margin);

      const left = Math.max(margin, anchorRect.left - tooltipWidth - margin);

      setTooltipStyle({
        position: "fixed",
        top,
        left,
        width: tooltipWidth,
        maxHeight: maxTooltipHeight,
        overflowY: "auto",
      });
    };

    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [isHovered, details, phaseDetails]);

  useEffect(() => {
    if (!isHovered) {
      setTooltipStyle({});
    }
  }, [isHovered]);

  return (
    <div
      ref={rowRef}
      className={`grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 min-w-0 transition hover:bg-slate-50 ${
        isSelected ? "bg-sky-50/70 ring-1 ring-inset ring-sky-200" : ""
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="relative inline-flex min-w-0 items-center gap-2">
        <span
          className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${getRankBadgeClass(index)}`}
        >
          #{index + 1}
        </span>

        <span
          ref={anchorRef}
          className="truncate text-sm font-medium text-slate-900 min-w-0 cursor-help"
        >
          {row.nickname}
        </span>

        {isHovered ? (
          <div
            ref={tooltipRef}
            style={tooltipStyle}
            className="z-50 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Détail des points de <span className="text-slate-900">{row.nickname}</span>
            </p>

            {details ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Groupes</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.group)} pts</strong>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Classement de groupe</span>
                  <strong className="text-sm text-slate-900">
                    {formatOneDecimal(groupPlacementPoints ?? 0)} pts
                  </strong>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Tours éliminatoires</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.knockout)} pts</strong>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-slate-600">Pronostics réel</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.real)} pts</strong>
                </div>
              </div>
            ) : (
              <p className="text-slate-500">Aucun détail disponible.</p>
            )}

            {phaseDetails?.length ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Base par étape
                </p>
                <div className="space-y-1.5">
                  {phaseDetails.map((phaseRow) => (
                    <div
                      key={phaseRow.phase}
                      className="flex items-center justify-between gap-4 text-slate-600"
                    >
                      <span className="truncate pr-2">{phaseRow.phase}</span>
                      <strong className="shrink-0 text-slate-900">
                        base {formatOneDecimal(phaseRow.base)} - {formatOneDecimal(phaseRow.points)} pts
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </span>

      <strong className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
        {formatOneDecimal(row.points)} pts
      </strong>
    </div>
  );
}

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [detailsByUser, setDetailsByUser] = useState<Record<string, ScoreBreakdown>>({});
  const [groupPlacementPointsByUser, setGroupPlacementPointsByUser] = useState<Record<string, number>>({});
  const [phaseDetailsByUser, setPhaseDetailsByUser] = useState<Record<string, PhaseDetailRow[]>>({});
  const [scoreReportByUser, setScoreReportByUser] = useState<Record<string, ScoreReportRow[]>>({});
  const [message, setMessage] = useState("Chargement...");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();

  const selectedRow = useMemo(
    () => rows.find((row) => row.user_id === selectedUserId) ?? null,
    [rows, selectedUserId]
  );

  const selectedReport = selectedUserId ? scoreReportByUser[selectedUserId] ?? [] : [];
  const selectedReportSections = useMemo(
    () => getReportSections(selectedReport),
    [selectedReport]
  );

  useEffect(() => {
    if (!selectedRow || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedRow]);

  useEffect(() => {
    const handleActiveGroupUpdated = () => {
      setActiveGroupId(window.localStorage.getItem(STORAGE_KEY));
    };

    window.addEventListener("active-group-updated", handleActiveGroupUpdated);
    return () => window.removeEventListener("active-group-updated", handleActiveGroupUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setMessage("Chargement...");

        const response = await fetch(
          `/api/leaderboard${activeGroupId ? `?groupId=${encodeURIComponent(activeGroupId)}` : ""}`,
          {
            cache: "no-store",
          }
        );

        if (cancelled) return;

        const payload = (await response.json()) as LeaderboardPayload & { error?: string };

        if (!response.ok) {
          const errorMessage = payload.error ?? "Erreur chargement classement.";
          setMessage(errorMessage);
          return;
        }

        setRows(payload.rows);
        setDetailsByUser(payload.detailsByUser);
        setGroupPlacementPointsByUser(payload.groupPlacementPointsByUser ?? {});
        setPhaseDetailsByUser(payload.phaseDetailsByUser);
        setScoreReportByUser(payload.scoreReportByUser ?? {});
        setMessage(payload.message);
      } catch (error) {
        console.error("Erreur leaderboard:", error);
        setMessage(
          error instanceof Error
            ? error.message
            : "Erreur chargement classement."
        );
      }
    }

    void loadLeaderboard();

    const handleLeaderboardRefresh = () => {
      void loadLeaderboard();
    };

    const channel = supabase
      .channel("leaderboard-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "predictions",
        },
        () => {
          void loadLeaderboard();
          router.refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
        },
        () => {
          void loadLeaderboard();
          router.refresh();
        }
      )
      .subscribe();

    window.addEventListener("leaderboard-data-refresh", handleLeaderboardRefresh);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener("leaderboard-data-refresh", handleLeaderboardRefresh);
    };
  }, [activeGroupId]);

  useEffect(() => {
    if (!selectedUserId) return;
    if (rows.some((row) => row.user_id === selectedUserId)) return;

    setSelectedUserId("");
  }, [rows, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;

    rowRefs.current[selectedUserId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [selectedUserId]);

  return (
    <section className="w-full">
      {selectedRow ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 pt-12 backdrop-blur-sm">
          <div
            className="relative mt-4 max-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <button
                type="button"
                aria-label="Fermer le report"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setSelectedUserId("")}
              >
                <span className="text-lg leading-none">×</span>
              </button>

              <div className="flex items-start justify-between gap-4 pr-12">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Report détaillé
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{selectedRow.nickname}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Liste synthétique de chaque événement ayant rapporté des points.
                  </p>
                </div>

                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900">
                  {formatOneDecimal(selectedRow.points)} pts
                </div>
              </div>
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-4 sm:p-6">
              <div className="space-y-3">
                <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-[1.3fr_0.9fr_0.7fr_0.7fr]">
                  <div>Événement</div>
                  <div>Contexte</div>
                  <div className="text-right">Cote</div>
                  <div className="text-right">Points</div>
                </div>

                <div className="space-y-4">
                  {selectedReportSections.length ? (
                    selectedReportSections.map((section) => {
                      const sectionPoints = section.items.reduce((sum, item) => sum + item.points, 0);

                      return (
                        <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-200 px-3 py-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{section.subtitle}</p>
                            </div>
                            <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900">
                              {formatOneDecimal(sectionPoints)} pts
                            </div>
                          </div>

                          <div>
                            {section.key === "groupMatches" || section.key === "groupPlacement" || section.key === "knockoutQualification" || section.key === "realKnockout" ? (
                              <div className="space-y-4">
                                {groupMatchReportItemsByPhase(section.items).map((phaseGroup) => {
                                  const phasePoints = phaseGroup.items.reduce(
                                    (sum, item) => sum + item.points,
                                    0
                                  );
                                  const groupLabel =
                                    section.key === "groupPlacement"
                                      ? "Points cumulés sur ce classement."
                                      : section.key === "knockoutQualification"
                                        ? "Points cumulés sur ce tour."
                                        : section.key === "realKnockout"
                                          ? "Points cumulés sur ce tour réel."
                                          : "Points cumulés sur ce groupe.";

                                  return (
                                    <div key={phaseGroup.phase} className="border-t border-slate-100 first:border-t-0 first:pt-0 pt-4">
                                      <div className="mb-2 flex items-start justify-between gap-4 px-3">
                                        <div>
                                          <p className="text-sm font-semibold text-slate-900">{phaseGroup.phase}</p>
                                          <p className="text-xs text-slate-500">{groupLabel}</p>
                                        </div>
                                        <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-900">
                                          {formatOneDecimal(phasePoints)} pts
                                        </div>
                                      </div>

                                      <div className="space-y-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                        {phaseGroup.items.map((item, index) => (
                                          <div
                                            key={item.reportId}
                                            className={`grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1.3fr_0.9fr_0.7fr_0.7fr] sm:items-center ${
                                              index > 0 ? "border-t border-slate-100" : ""
                                            }`}
                                          >
                                            <div className="min-w-0">
                                              <p className="truncate font-semibold text-slate-900">{item.label}</p>
                                              <p className="text-xs text-slate-500">{item.phase}</p>
                                            </div>

                                            {item.kind === "match" ? (
                                              <div className="text-xs text-slate-600">
                                                <p>
                                                  {item.predictedScore} / {item.actualScore}
                                                </p>
                                                <p className="mt-0.5 text-slate-500">
                                                  {item.predictedOutcome} → {item.actualOutcome}
                                                </p>
                                              </div>
                                            ) : item.kind === "groupPlacement" ? (
                                              <div className="text-xs text-slate-600">
                                                <p>
                                                  {item.team} - rang {item.rank}
                                                </p>
                                                <p className="mt-0.5 text-slate-500">
                                                  {item.predictedCount}/{item.participants} pronostics sur ce rang
                                                </p>
                                              </div>
                                            ) : item.kind === "knockoutPlacement" ? (
                                              <div className="text-xs text-slate-600">
                                                <p>
                                                  {item.team} - {item.slotLabel}
                                                </p>
                                                <p className="mt-0.5 text-slate-500">
                                                  placement en {item.phase}
                                                </p>
                                                <p className="mt-0.5 text-slate-500">
                                                  {item.predictedCount}/{item.participants} joueurs sur cette équipe dans ce tour
                                                </p>
                                              </div>
                                            ) : null}

                                            <div className="text-right text-xs font-medium text-slate-700">
                                              x{formatOneDecimal(item.odds)}
                                            </div>

                                            <div className="text-right text-sm font-semibold text-slate-900">
                                              +{formatOneDecimal(item.points)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              section.items.map((item, index) => (
                                <div
                                  key={item.reportId}
                                  className={`grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1.3fr_0.9fr_0.7fr_0.7fr] sm:items-center ${
                                    index > 0 ? "border-t border-slate-100" : ""
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900">{item.label}</p>
                                    <p className="text-xs text-slate-500">{item.phase}</p>
                                  </div>

                                  {item.kind === "match" ? (
                                    <div className="text-xs text-slate-600">
                                      <p>
                                        {item.predictedScore} / {item.actualScore}
                                      </p>
                                      <p className="mt-0.5 text-slate-500">
                                        {item.predictedOutcome} → {item.actualOutcome}
                                      </p>
                                    </div>
                                  ) : item.kind === "groupPlacement" ? (
                                    (() => {
                                      const groupItem = item as Extract<ScoreReportRow, { kind: "groupPlacement" }>;

                                      return (
                                    <div className="text-xs text-slate-600">
                                      <p>
                                        {groupItem.team} - rang {groupItem.rank}
                                      </p>
                                      <p className="mt-0.5 text-slate-500">
                                        {groupItem.predictedCount}/{groupItem.participants} pronostics sur ce rang
                                      </p>
                                    </div>
                                      );
                                    })()
                                  ) : item.kind === "knockoutPlacement" ? (
                                    (() => {
                                      const knockoutItem = item as Extract<ScoreReportRow, { kind: "knockoutPlacement" }>;

                                      return (
                                    <div className="text-xs text-slate-600">
                                      <p>
                                        {knockoutItem.team} - {knockoutItem.slotLabel}
                                      </p>
                                      <p className="mt-0.5 text-slate-500">
                                        placement en {knockoutItem.phase}
                                      </p>
                                      <p className="mt-0.5 text-slate-500">
                                        {knockoutItem.predictedCount}/{knockoutItem.participants} joueurs sur cette équipe dans ce tour
                                      </p>
                                    </div>
                                      );
                                    })()
                                  ) : null}

                                  <div className="text-right text-xs font-medium text-slate-700">
                                    x{formatOneDecimal(item.odds)}
                                  </div>

                                  <div className="text-right text-sm font-semibold text-slate-900">
                                    +{formatOneDecimal(item.points)}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                      Aucun point acquis pour ce joueur.
                    </p>
                  )}
                </div>

                {selectedReportSections.length ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                    Chaque ligne correspond à un point gagné et affiche la cote appliquée ainsi que le total obtenu.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {message}
        </p>
      ) : (
        <div className="relative w-full overflow-visible rounded-lg border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Classement live</p>
                <p className="mt-1 text-xs text-slate-500">Sélectionne un joueur pour le retrouver dans la liste.</p>
              </div>

              <label className="flex w-full max-w-sm flex-col gap-1 text-xs font-medium text-slate-600">
                Joueur
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  <option value="">Tous les joueurs</option>
                  {rows.map((row) => (
                    <option key={row.user_id} value={row.user_id}>
                      {row.nickname}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                {selectedRow ? `Joueur sélectionné: ${selectedRow.nickname}` : "Aucun joueur sélectionné"}
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-900">
                Live
              </span>
            </div>
          </div>

          <div className="overflow-visible divide-y divide-slate-100">
            {rows.map((row, index) => (
              <LeaderboardRowItem
                key={row.user_id}
                row={row}
                index={index}
                isSelected={selectedUserId === row.user_id}
                details={detailsByUser[row.user_id]}
                groupPlacementPoints={groupPlacementPointsByUser[row.user_id]}
                phaseDetails={phaseDetailsByUser[row.user_id]}
                rowRef={(element) => {
                  rowRefs.current[row.user_id] = element;
                }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}