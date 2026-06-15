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
import ScoreReportDetails from "./score-report-details";

const STORAGE_KEY = "activeGroupId";

type LeaderboardRow = LeaderboardPayload["rows"][number];

type LeaderboardRowItemProps = {
  row: LeaderboardRow;
  index: number;
  isSelected?: boolean;
  details?: ScoreBreakdown;
  groupPlacementPoints?: number;
  phaseDetails?: PhaseDetailRow[];
  displayPoints?: number;
  onShowReport?: (userId: string) => void;
  rowRef?: (element: HTMLDivElement | null) => void;
};

type RankingMetric = "total" | "group" | "groupPlacement" | "knockout" | "real";

const RANKING_METRICS: { key: RankingMetric; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "group", label: "Matchs 1T" },
  { key: "groupPlacement", label: "Classement Grp" },
  { key: "knockout", label: "2e tours" },
  { key: "real", label: "2e tours réel" },
];

function getMetricValue(
  metric: RankingMetric,
  row: LeaderboardRow,
  details?: ScoreBreakdown,
  groupPlacementPoints = 0
) {
  if (metric === "total") return row.points;
  if (!details) return 0;

  switch (metric) {
    case "group":
      return details.group - groupPlacementPoints;
    case "groupPlacement":
      return groupPlacementPoints;
    case "knockout":
      return details.knockout;
    case "real":
      return details.real;
    default:
      return 0;
  }
}

function getScoreBreakdownLabel(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return "Groupes";
  if (normalizedPhase.includes("buteur") || normalizedPhase.includes("scorer")) {
    return "Meilleur buteur";
  }
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
  return { group: 0, groupPlacement: 0, knockout: 0, topScorer: 0, real: 0 };
}

function getBreakdownForUser(rows: PhaseDetailRow[]) {
  return rows.reduce<ScoreBreakdown>((acc, row) => {
    const label = getScoreBreakdownLabel(row.phase);

    if (label === "Groupes") {
      acc.group += row.points;
      if (row.phase.toLowerCase().includes("classement")) {
        acc.groupPlacement += row.points;
      }
    } else if (label === "Meilleur buteur") {
      acc.topScorer += row.points;
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
  displayPoints,
  onShowReport,
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
          className={`truncate text-sm font-medium min-w-0 cursor-help ${
            row.nickname === "Mme Claude" ? "text-red-600" : "text-slate-900"
          }`}
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
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-700">Total</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(row.points)} pts</strong>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Matchs 1T</span>
                  <strong className="text-sm text-slate-900">
                    {formatOneDecimal(details.group - (groupPlacementPoints ?? 0))} pts
                  </strong>
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
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Meilleur buteur</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.topScorer)} pts</strong>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-slate-600">Pronostics réel</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.real)} pts</strong>
                </div>

                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onShowReport?.(row.user_id);
                  }}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Voir le report détaillé
                </button>
              </div>
            ) : (
              <p className="text-slate-500">Aucun détail disponible.</p>
            )}

          </div>
        ) : null}
      </span>

      <strong className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
        {formatOneDecimal(displayPoints ?? row.points)} pts
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
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("total");
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

  const rankedRows = useMemo(() => {
    return rows
      .map((row) => ({
        row,
        value: getMetricValue(
          rankingMetric,
          row,
          detailsByUser[row.user_id],
          groupPlacementPointsByUser[row.user_id] ?? 0
        ),
      }))
      .sort((a, b) => b.value - a.value || b.row.points - a.row.points);
  }, [rows, rankingMetric, detailsByUser, groupPlacementPointsByUser]);

  const selectedReport = selectedUserId ? scoreReportByUser[selectedUserId] ?? [] : [];

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
              <ScoreReportDetails reportRows={selectedReport} />
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Classement live</p>
                <p className="mt-1 text-xs text-slate-500">
                  Survole un joueur puis ouvre son report détaillé.
                </p>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900">
                Live
              </span>
            </div>
          </div>

          <div className="overflow-visible divide-y divide-slate-100">
            <div className="flex flex-col gap-2 border-b border-slate-100 bg-white px-4 py-3">
              {(() => {
                const totalMetric = RANKING_METRICS[0];
                const isTotalActive = rankingMetric === totalMetric.key;

                return (
                  <label
                    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      isTotalActive
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-red-200 bg-white text-red-600 hover:border-red-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="ranking-metric"
                      value={totalMetric.key}
                      checked={isTotalActive}
                      onChange={() => setRankingMetric(totalMetric.key)}
                      className="sr-only"
                    />
                    {totalMetric.label}
                  </label>
                );
              })()}

              <div className="grid grid-cols-2 gap-2">
                {RANKING_METRICS.slice(1).map((metric) => {
                  const isActive = rankingMetric === metric.key;

                  return (
                    <label
                      key={metric.key}
                      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ranking-metric"
                        value={metric.key}
                        checked={isActive}
                        onChange={() => setRankingMetric(metric.key)}
                        className="sr-only"
                      />
                      {metric.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {rankedRows.map(({ row, value }, index) => (
              <LeaderboardRowItem
                key={row.user_id}
                row={row}
                index={index}
                isSelected={selectedUserId === row.user_id}
                details={detailsByUser[row.user_id]}
                groupPlacementPoints={groupPlacementPointsByUser[row.user_id]}
                phaseDetails={phaseDetailsByUser[row.user_id]}
                displayPoints={value}
                onShowReport={(userId) => setSelectedUserId(userId)}
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