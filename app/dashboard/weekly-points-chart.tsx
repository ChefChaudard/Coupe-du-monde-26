import type { WeeklyPoint } from "./leaderboard-data";

export function formatWeekLabel(weekStart: string) {
  const [, month, day] = weekStart.split("-");
  return `${day}/${month}`;
}

// Petit graphique en ligne (SVG, sans dependance externe) de l'evolution
// hebdomadaire des points cumules d'un joueur. N'affiche que les semaines ou
// au moins un point a ete attribue a l'un des joueurs (deja filtre en amont
// par computeWeeklyPointsByUser). Partage entre le classement desktop
// (app/dashboard/leaderboard.tsx) et le classement joueurs
// (app/classement/mobile/MobileLeaderboard.tsx).
export function WeeklyPointsChart({
  points,
  nickname,
}: {
  points: WeeklyPoint[];
  nickname: string;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-slate-500">Aucun point attribue pour le moment.</p>;
  }

  const width = 300;
  const height = 140;
  const padLeft = 34;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 24;
  const maxValue = Math.max(...points.map((p) => p.cumulativePoints), 1);
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const xFor = (index: number) =>
    points.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) => padTop + plotHeight - (value / maxValue) * plotHeight;

  const polylinePoints = points.map((p, i) => `${xFor(i)},${yFor(p.cumulativePoints)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Evolution hebdomadaire des points cumules de ${nickname}`}
      className="w-full"
    >
      <line
        x1={padLeft}
        y1={padTop + plotHeight}
        x2={width - padRight}
        y2={padTop + plotHeight}
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      <text x={padLeft - 6} y={padTop + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
        {Math.round(maxValue * 100) / 100}
      </text>
      <text x={padLeft - 6} y={padTop + plotHeight} textAnchor="end" fontSize={9} fill="#94a3b8">
        0
      </text>

      {points.length > 1 ? (
        <polyline points={polylinePoints} fill="none" stroke="#7a1f2c" strokeWidth={2} />
      ) : null}

      {points.map((p, i) => (
        <circle key={p.weekStart} cx={xFor(i)} cy={yFor(p.cumulativePoints)} r={4} fill="#7a1f2c" stroke="#ffffff" strokeWidth={1.5} />
      ))}

      {points.map((p, i) => (
        <text key={p.weekStart} x={xFor(i)} y={height - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
          {formatWeekLabel(p.weekStart)}
        </text>
      ))}
    </svg>
  );
}

export type PlayerWeeklySeries = {
  userId: string;
  nickname: string;
  points: WeeklyPoint[];
};

// Palette qualitative pour distinguer jusqu'a 8 joueurs sur le meme graphique.
const SERIES_COLORS = [
  "#7a1f2c",
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#7e22ce",
  "#0e7490",
  "#be123c",
  "#334155",
];

// Graphique combine (SVG, sans dependance externe) montrant l'evolution
// hebdomadaire des points cumules de plusieurs joueurs en meme temps, avec
// une legende couleur. Toutes les series partagent le meme axe de semaines
// (deja garanti par computeWeeklyPointsByUser, qui calcule une liste unique
// de semaines pour tous les joueurs).
export function MultiPlayerWeeklyPointsChart({ series }: { series: PlayerWeeklySeries[] }) {
  const weeks = series.find((s) => s.points.length > 0)?.points.map((p) => p.weekStart) ?? [];

  if (weeks.length === 0) {
    return <p className="text-xs text-slate-500">Aucun point attribue pour le moment.</p>;
  }

  const width = 340;
  const height = 220;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 24;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  // Axe des ordonnees resserre sur les valeurs reellement tracees : le
  // minimum de l'axe est la plus basse valeur de tous les points (tous
  // joueurs, toutes semaines), le maximum la plus haute. Plusieurs graduations
  // regulieres sont affichees entre les deux pour mieux separer les joueurs.
  const allValues = series.flatMap((s) => s.points.map((p) => p.cumulativePoints));
  let axisMin = Math.min(...allValues);
  let axisMax = Math.max(...allValues);

  if (axisMax - axisMin < 1) {
    axisMin -= 0.5;
    axisMax += 0.5;
  }

  const TICK_COUNT = 6;
  const tickValues = Array.from(
    { length: TICK_COUNT },
    (_, i) => axisMin + ((axisMax - axisMin) * i) / (TICK_COUNT - 1)
  );
  const formatTick = (value: number) =>
    axisMax - axisMin >= 20 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);

  const xFor = (index: number) =>
    weeks.length === 1 ? padLeft + plotWidth / 2 : padLeft + (index / (weeks.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    padTop + plotHeight - ((value - axisMin) / (axisMax - axisMin)) * plotHeight;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Evolution hebdomadaire des points cumules des joueurs"
        className="w-full"
      >
        {tickValues.map((tick, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              y1={yFor(tick)}
              x2={width - padRight}
              y2={yFor(tick)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={padLeft - 6} y={yFor(tick) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {series.map((s, seriesIndex) => {
          const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
          const polylinePoints = s.points
            .map((p, i) => `${xFor(i)},${yFor(p.cumulativePoints)}`)
            .join(" ");

          return (
            <g key={s.userId}>
              {s.points.length > 1 ? (
                <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={2} />
              ) : null}
              {s.points.map((p, i) => (
                <circle
                  key={p.weekStart}
                  cx={xFor(i)}
                  cy={yFor(p.cumulativePoints)}
                  r={2.5}
                  fill={color}
                />
              ))}
            </g>
          );
        })}

        {weeks.map((weekStart, i) => (
          <text key={weekStart} x={xFor(i)} y={height - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {formatWeekLabel(weekStart)}
          </text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s, seriesIndex) => (
          <span key={s.userId} className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[seriesIndex % SERIES_COLORS.length] }}
            />
            {s.nickname}
          </span>
        ))}
      </div>
    </div>
  );
}
