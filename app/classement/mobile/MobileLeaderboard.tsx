"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type {
  LeaderboardPayload,
  ScoreBreakdown,
  ScoreReportRow,
} from "@/app/dashboard/leaderboard-data";
import { formatOneDecimal } from "@/app/dashboard/format";
import ScoreReportDetails from "@/app/dashboard/score-report-details";

const STORAGE_KEY = "activeGroupId";
const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";

type LeaderboardRow = LeaderboardPayload["rows"][number];

type RankingMetric = "total" | "group" | "groupPlacement" | "knockout" | "real";

const RANKING_METRICS: { key: RankingMetric; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "group", label: "Matchs 1T" },
  { key: "groupPlacement", label: "Classement Grp" },
  { key: "knockout", label: "2e tours" },
  { key: "real", label: "2e tours réel" },
];

type ReportSectionItem = {
  key: string;
  label: string;
  getValue: (breakdown: ScoreBreakdown, groupPlacementPoints: number) => number;
};

const REPORT_SECTION_ITEMS: ReportSectionItem[] = [
  { key: "groupMatches", label: "Matchs 1T", getValue: (b, g) => b.group - g },
  { key: "groupPlacement", label: "Classement groupe", getValue: (b, g) => b.groupPlacement || g },
  { key: "knockoutQualification", label: "Tours élim.", getValue: (b) => b.knockout },
  { key: "realKnockout", label: "2e tours réels", getValue: (b) => b.real },
  { key: "topScorer", label: "Meilleur buteur", getValue: (b) => b.topScorer },
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

function rankBadgeClasses(index: number) {
  if (index === 0) return "bg-amber-400 text-amber-950";
  if (index === 1) return "bg-slate-300 text-slate-800";
  if (index === 2) return "bg-orange-300 text-orange-950";
  return "bg-slate-100 text-slate-600";
}

export default function MobileLeaderboard() {
  const router = useRouter();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [detailsByUser, setDetailsByUser] = useState<
    Record<string, ScoreBreakdown>
  >({});
  const [groupPlacementPointsByUser, setGroupPlacementPointsByUser] = useState<
    Record<string, number>
  >({});
  const [scoreReportByUser, setScoreReportByUser] = useState<
    Record<string, ScoreReportRow[]>
  >({});
  const [message, setMessage] = useState("Chargement...");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [reportUserId, setReportUserId] = useState<string | null>(null);
  const [reportSectionKey, setReportSectionKey] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("total");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    const handleActiveGroupUpdated = () => {
      setActiveGroupId(window.localStorage.getItem(STORAGE_KEY));
    };

    window.addEventListener("active-group-updated", handleActiveGroupUpdated);
    return () =>
      window.removeEventListener(
        "active-group-updated",
        handleActiveGroupUpdated
      );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setMessage("Chargement...");

        const response = await fetch(
          `/api/leaderboard${
            activeGroupId
              ? `?groupId=${encodeURIComponent(activeGroupId)}`
              : ""
          }`,
          { cache: "no-store" }
        );

        if (cancelled) return;

        const payload = (await response.json()) as LeaderboardPayload & {
          error?: string;
        };

        if (!response.ok) {
          setMessage(payload.error ?? "Erreur chargement classement.");
          return;
        }

        setRows(payload.rows);
        setDetailsByUser(payload.detailsByUser);
        setGroupPlacementPointsByUser(
          payload.groupPlacementPointsByUser ?? {}
        );
        setScoreReportByUser(payload.scoreReportByUser ?? {});
        setMessage(payload.message);
      } catch (error) {
        console.error("Erreur leaderboard mobile:", error);
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
      .channel("leaderboard-mobile-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "predictions" },
        () => {
          void loadLeaderboard();
          router.refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          void loadLeaderboard();
          router.refresh();
        }
      )
      .subscribe();

    window.addEventListener(
      LEADERBOARD_REFRESH_EVENT,
      handleLeaderboardRefresh
    );

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener(
        LEADERBOARD_REFRESH_EVENT,
        handleLeaderboardRefresh
      );
    };
  }, [activeGroupId, router]);

  const sortedRows = useMemo(
    () =>
      rows
        .map((row) => ({
          row,
          value: getMetricValue(
            rankingMetric,
            row,
            detailsByUser[row.user_id],
            groupPlacementPointsByUser[row.user_id] ?? 0
          ),
        }))
        .sort((a, b) => b.value - a.value || b.row.points - a.row.points),
    [rows, rankingMetric, detailsByUser, groupPlacementPointsByUser]
  );

  const reportRow = useMemo(
    () =>
      sortedRows.find((entry) => entry.row.user_id === reportUserId)?.row ?? null,
    [sortedRows, reportUserId]
  );

  useEffect(() => {
    if (reportUserId && !sortedRows.some((entry) => entry.row.user_id === reportUserId)) {
      setReportUserId(null);
      setReportSectionKey(null);
    }
  }, [sortedRows, reportUserId]);

  function closeReport() {
    setReportUserId(null);
    setReportSectionKey(null);
  }

  function openReportSection(userId: string, sectionKey: string) {
    setReportUserId(userId);
    setReportSectionKey(sectionKey);
  }

  useEffect(() => {
    if (!reportRow || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [reportRow]);

  if (sortedRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-sm">
        {message}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {(() => {
          const totalMetric = RANKING_METRICS[0];
          const isTotalActive = rankingMetric === totalMetric.key;

          return (
            <label
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                isTotalActive
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-red-200 bg-white text-red-600"
              }`}
            >
              <input
                type="radio"
                name="ranking-metric-mobile"
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
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <input
                  type="radio"
                  name="ranking-metric-mobile"
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

      {sortedRows.map(({ row, value }, index) => {
        const breakdown = detailsByUser[row.user_id];
        const groupPlacementPoints =
          groupPlacementPointsByUser[row.user_id] ?? 0;
        const isExpanded = expandedUserId === row.user_id;

        return (
          <article
            key={row.user_id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() =>
                setExpandedUserId(isExpanded ? null : row.user_id)
              }
              className="flex w-full items-center gap-3 px-3 py-3 text-left"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${rankBadgeClasses(
                  index
                )}`}
              >
                {index + 1}
              </span>

              <span className="flex-1 truncate text-sm font-semibold text-slate-900">
                {row.nickname || "Joueur"}
              </span>

              <span className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm font-black text-white">
                {formatOneDecimal(value)}
              </span>

              <svg
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isExpanded && breakdown ? (
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
                <p className="mb-2 text-[11px] text-slate-500">
                  Touchez une catégorie pour voir le détail des points.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {REPORT_SECTION_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => openReportSection(row.user_id, item.key)}
                      className="flex cursor-pointer items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-left shadow-sm transition active:scale-[0.98]"
                    >
                      <span className="text-slate-500">{item.label}</span>
                      <span className="font-semibold text-slate-900">
                        {formatOneDecimal(item.getValue(breakdown, groupPlacementPoints))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}

      {reportRow ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-3 pt-8 backdrop-blur-sm"
          onClick={closeReport}
        >
          <div
            className="relative mt-2 max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
              <button
                type="button"
                aria-label="Fermer le report"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                onClick={closeReport}
              >
                <span className="text-lg leading-none">×</span>
              </button>

              <div className="pr-12">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Report détaillé
                  {reportSectionKey
                    ? ` · ${REPORT_SECTION_ITEMS.find((item) => item.key === reportSectionKey)?.label ?? ""}`
                    : ""}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  {reportRow.nickname || "Joueur"}
                </h3>
                <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900">
                  {formatOneDecimal(reportRow.points)} pts
                </div>
              </div>
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-4">
              <ScoreReportDetails
                reportRows={scoreReportByUser[reportRow.user_id] ?? []}
                sectionKey={reportSectionKey ?? undefined}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
