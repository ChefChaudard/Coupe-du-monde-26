"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type {
  LeaderboardPayload,
  ScoreBreakdown,
  ScoreReportRow,
  WeeklyPoint,
} from "@/app/dashboard/leaderboard-data";
import { formatOneDecimal } from "@/app/dashboard/format";
import ScoreReportDetails from "@/app/dashboard/score-report-details";
import { MultiPlayerWeeklyPointsChart } from "@/app/dashboard/weekly-points-chart";

const STORAGE_KEY = "activeGroupId";
const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";

type LeaderboardRow = LeaderboardPayload["rows"][number];

type RankingMetric = "total" | "group" | "groupPlacement" | "knockout" | "real";

const RANKING_METRICS: { key: RankingMetric; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "group", label: "1er Tour" },
  { key: "groupPlacement", label: "Classement Equipes" },
  { key: "knockout", label: "Qualifiés" },
  { key: "real", label: "2e tours réel" },
];

type ReportSectionItem = {
  key: string;
  label: string;
  getValue: (breakdown: ScoreBreakdown, groupPlacementPoints: number) => number;
};

const REPORT_SECTION_ITEMS: ReportSectionItem[] = [
  { key: "groupMatches", label: "1er Tour", getValue: (b, g) => b.group - g },
  { key: "groupPlacement", label: "Classement Equipes", getValue: (b, g) => b.groupPlacement || g },
  { key: "knockoutQualification", label: "Qualifiés", getValue: (b) => b.knockout },
  { key: "realKnockout", label: "2e tours réels", getValue: (b) => b.real },
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

// Infobulle ancree a un bouton (position "fixed" bornee au viewport), ouverte
// au survol a la souris ou par appui sur mobile, fermee par un nouvel appui ou
// un appui en dehors. Meme comportement que le graphique du bouton Total.
function useAnchoredTooltip(preferredMaxWidth: number, minWidth: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const anchorRef = useRef<HTMLLabelElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerTypeRef = useRef<string>("mouse");

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;

      if (!anchor || typeof window === "undefined") return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const gap = 4;
      const width = Math.min(
        viewportWidth - margin * 2,
        Math.max(minWidth, preferredMaxWidth)
      );
      const left = Math.max(
        margin,
        Math.min(viewportWidth - width - margin, anchorRect.left)
      );

      // Colle juste sous le bouton ; au-dessus uniquement s'il n'y a presque
      // pas de place en dessous (la hauteur est alors bornee, avec defilement).
      const spaceBelow = viewportHeight - anchorRect.bottom - gap - margin;
      const spaceAbove = anchorRect.top - gap - margin;
      const placeAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

      setStyle(
        placeAbove
          ? {
              position: "fixed",
              bottom: viewportHeight - anchorRect.top + gap,
              left,
              width,
              maxHeight: Math.max(120, spaceAbove),
              overflowY: "auto",
              overflowX: "auto",
            }
          : {
              position: "fixed",
              top: anchorRect.bottom + gap,
              left,
              width,
              maxHeight: Math.max(120, spaceBelow),
              overflowY: "auto",
              overflowX: "auto",
            }
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, minWidth, preferredMaxWidth]);

  useEffect(() => {
    if (!isOpen) setStyle({});
  }, [isOpen]);

  // Tactile : un appui en dehors du bouton / de l'infobulle la ferme.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return { isOpen, setIsOpen, style, anchorRef, tooltipRef, pointerTypeRef };
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
  const [weeklyPointsByUser, setWeeklyPointsByUser] = useState<
    Record<string, WeeklyPoint[]>
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

  const [isTotalMetricHovered, setIsTotalMetricHovered] = useState(false);
  const [totalMetricTooltipStyle, setTotalMetricTooltipStyle] = useState<CSSProperties>({});
  const totalMetricAnchorRef = useRef<HTMLLabelElement>(null);
  const totalMetricTooltipRef = useRef<HTMLDivElement>(null);
  const totalMetricPointerTypeRef = useRef<string>("mouse");

  // Tactile : un appui en dehors du bouton Total / du graphique le ferme.
  useEffect(() => {
    if (!isTotalMetricHovered) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target as Node;
      if (
        totalMetricAnchorRef.current?.contains(target) ||
        totalMetricTooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsTotalMetricHovered(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isTotalMetricHovered]);

  useLayoutEffect(() => {
    if (!isTotalMetricHovered) return;

    const updateTotalMetricTooltipPosition = () => {
      const anchor = totalMetricAnchorRef.current;
      const tooltip = totalMetricTooltipRef.current;

      if (!anchor || !tooltip || typeof window === "undefined") return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const preferredWidth = Math.min(340, viewportWidth - margin * 2);
      const tooltipWidth = Math.max(280, preferredWidth);
      const maxTooltipHeight = Math.max(160, viewportHeight - margin * 2);
      const tooltipHeight = Math.min(tooltip.offsetHeight || 260, maxTooltipHeight);

      const spaceBelow = viewportHeight - anchorRect.bottom - margin;
      const spaceAbove = anchorRect.top - margin;
      const placeAbove = spaceBelow < tooltipHeight && spaceAbove >= tooltipHeight;

      const top = placeAbove
        ? Math.max(margin, anchorRect.top - tooltipHeight - margin)
        : Math.min(viewportHeight - tooltipHeight - margin, anchorRect.bottom + margin);

      const left = Math.max(
        margin,
        Math.min(viewportWidth - tooltipWidth - margin, anchorRect.left)
      );

      setTotalMetricTooltipStyle({
        position: "fixed",
        top,
        left,
        width: tooltipWidth,
        maxHeight: maxTooltipHeight,
        overflowY: "auto",
      });
    };

    updateTotalMetricTooltipPosition();
    window.addEventListener("resize", updateTotalMetricTooltipPosition);
    window.addEventListener("scroll", updateTotalMetricTooltipPosition, true);

    return () => {
      window.removeEventListener("resize", updateTotalMetricTooltipPosition);
      window.removeEventListener("scroll", updateTotalMetricTooltipPosition, true);
    };
  }, [isTotalMetricHovered]);

  useEffect(() => {
    if (!isTotalMetricHovered) {
      setTotalMetricTooltipStyle({});
    }
  }, [isTotalMetricHovered]);

  // Tableau classement / points par journee, au survol du bouton "1er Tour".
  const groupTooltip = useAnchoredTooltip(460, 300);

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
        setWeeklyPointsByUser(payload.weeklyPointsByUser ?? {});
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

  const weeklySeries = useMemo(
    () =>
      sortedRows.map(({ row }) => ({
        userId: row.user_id,
        nickname: row.nickname || "Joueur",
        points: weeklyPointsByUser[row.user_id] ?? [],
      })),
    [sortedRows, weeklyPointsByUser]
  );

  // Pour chaque joueur et chaque journee du 1er tour (J1..J8, JB) : points de
  // la journee et rang (1 = meilleur, ex aequo = meme rang), a partir des
  // lignes de match du rapport de points. Joueurs tries par total des
  // journees.
  const journeeTable = useMemo(() => {
    const journeeOrder = (j: string) => (j === "JB" ? 100 : Number(j.slice(1)));
    const round2 = (value: number) => Math.round(value * 100) / 100;

    const pointsByUser = new Map<string, Map<string, number>>();
    const journeeSet = new Set<string>();

    for (const { row } of sortedRows) {
      const perJournee = new Map<string, number>();
      for (const item of scoreReportByUser[row.user_id] ?? []) {
        if (item.kind !== "match" || !item.journee) continue;
        journeeSet.add(item.journee);
        perJournee.set(
          item.journee,
          (perJournee.get(item.journee) ?? 0) + item.points
        );
      }
      pointsByUser.set(row.user_id, perJournee);
    }

    const journees = Array.from(journeeSet).sort(
      (a, b) => journeeOrder(a) - journeeOrder(b)
    );

    const players = sortedRows.map(({ row }) => {
      const cells = journees.map((journee) => {
        const points = round2(pointsByUser.get(row.user_id)?.get(journee) ?? 0);
        const rank =
          1 +
          sortedRows.filter(
            ({ row: other }) =>
              round2(pointsByUser.get(other.user_id)?.get(journee) ?? 0) > points
          ).length;
        return { points, rank };
      });
      return {
        userId: row.user_id,
        nickname: row.nickname || "Joueur",
        total: cells.reduce((sum, cell) => sum + cell.points, 0),
        cells,
      };
    });

    players.sort((a, b) => b.total - a.total);

    return { journees, players };
  }, [sortedRows, scoreReportByUser]);

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
            <span
              className="relative flex"
              onPointerDown={(e) => {
                totalMetricPointerTypeRef.current = e.pointerType;
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setIsTotalMetricHovered(true);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setIsTotalMetricHovered(false);
              }}
              onClick={(e) => {
                // Tactile : un appui sur "Total" ouvre/ferme le graphique.
                // Le clic synthetique du label sur l'input est ignore.
                if ((e.target as HTMLElement).tagName === "INPUT") return;
                if (totalMetricPointerTypeRef.current !== "mouse") {
                  setIsTotalMetricHovered((value) => !value);
                }
              }}
            >
              <label
                ref={totalMetricAnchorRef}
                className={`flex w-full cursor-help items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
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

              {isTotalMetricHovered ? (
                <div
                  ref={totalMetricTooltipRef}
                  style={totalMetricTooltipStyle}
                  className="z-50 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
                >
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Evolution des points cumules des joueurs
                  </p>
                  <MultiPlayerWeeklyPointsChart series={weeklySeries} />
                </div>
              ) : null}
            </span>
          );
        })()}

        <div className="grid grid-cols-2 gap-2">
          {RANKING_METRICS.slice(1).map((metric) => {
            const isActive = rankingMetric === metric.key;
            const isGroupMetric = metric.key === "group";

            const label = (
              <label
                key={isGroupMetric ? undefined : metric.key}
                ref={isGroupMetric ? groupTooltip.anchorRef : undefined}
                className={`flex ${
                  isGroupMetric ? "w-full cursor-help" : "cursor-pointer"
                } items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
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

            if (!isGroupMetric) return label;

            return (
              <span
                key={metric.key}
                className="relative flex"
                onPointerDown={(e) => {
                  groupTooltip.pointerTypeRef.current = e.pointerType;
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") groupTooltip.setIsOpen(true);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") groupTooltip.setIsOpen(false);
                }}
                onClick={(e) => {
                  // Tactile : un appui sur "1er Tour" ouvre/ferme le tableau.
                  if ((e.target as HTMLElement).tagName === "INPUT") return;
                  if (groupTooltip.pointerTypeRef.current !== "mouse") {
                    groupTooltip.setIsOpen((value) => !value);
                  }
                }}
              >
                {label}

                {groupTooltip.isOpen && typeof document !== "undefined" ? createPortal(
                  <div
                    ref={groupTooltip.tooltipRef}
                    style={groupTooltip.style}
                    onClick={(e) => e.stopPropagation()}
                    className="z-50 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Classement par journée (1er tour)
                      </p>
                      <button
                        type="button"
                        aria-label="Fermer"
                        onClick={() => groupTooltip.setIsOpen(false)}
                        className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        ✕
                      </button>
                    </div>
                    {journeeTable.journees.length === 0 ? (
                      <p className="text-slate-500">
                        Aucun point attribue pour le moment.
                      </p>
                    ) : (
                      <table className="w-full border-collapse text-center">
                        <thead>
                          <tr>
                            <th className="pb-1 pr-2 text-left text-[10px] font-medium text-slate-400">
                              Joueur
                            </th>
                            {journeeTable.journees.map((journee) => (
                              <th
                                key={journee}
                                className="px-1 pb-1 text-[10px] font-semibold uppercase text-slate-500"
                              >
                                {journee}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {journeeTable.players.map((player) => (
                            <tr
                              key={player.userId}
                              className="border-t border-slate-100"
                            >
                              <td className="max-w-[80px] truncate py-1 pr-2 text-left text-[11px] font-medium text-slate-900">
                                {player.nickname}
                              </td>
                              {player.cells.map((cell, cellIndex) => (
                                <td
                                  key={journeeTable.journees[cellIndex]}
                                  className="px-1 py-1 leading-tight"
                                >
                                  <div
                                    className={`text-xs font-bold ${
                                      cell.rank === 1
                                        ? "text-emerald-600"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {cell.rank}
                                  </div>
                                  <div className="text-[9px] text-slate-400">
                                    {formatOneDecimal(cell.points)}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>,
                  document.body
                ) : null}
              </span>
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
