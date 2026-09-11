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
