import { useState } from "react";
import { formatOneDecimal } from "./format";

type StandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export default function GroupStandingsTooltip({
  groupName,
  predictedStandings,
  actualStandings,
}: {
  groupName: string;
  predictedStandings: StandingRow[];
  actualStandings: StandingRow[];
}) {
  const [isHovered, setIsHovered] = useState(false);

  function renderStandingsTable(title: string, standings: StandingRow[]) {
    return (
      <div className="space-y-2">
        <h5 className="font-semibold text-slate-950">{title}</h5>

        {standings.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune donnee disponible.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-left text-slate-900">
                <th className="w-[220px] py-1 pl-8 pr-4">Equipe</th>
                <th className="px-1 text-center">J</th>
                <th className="px-1 text-center">G</th>
                <th className="px-1 text-center">N</th>
                <th className="px-1 text-center">P</th>
                <th className="px-1 text-center">BP</th>
                <th className="px-1 text-center">BC</th>
                <th className="px-1 text-center">Diff</th>
                <th className="pl-1 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.team} className="border-b border-slate-100 last:border-b-0">
                  <td className="w-[220px] py-1 pl-8 pr-4 font-medium">{row.team}</td>
                  <td className="px-1 text-center">{row.played}</td>
                  <td className="px-1 text-center">{row.won}</td>
                  <td className="px-1 text-center">{row.drawn}</td>
                  <td className="px-1 text-center">{row.lost}</td>
                  <td className="px-1 text-center">{row.goalsFor}</td>
                  <td className="px-1 text-center">{row.goalsAgainst}</td>
                  <td className="px-1 text-center">{row.goalDifference}</td>
                  <td className="pl-1 text-center font-bold">{formatOneDecimal(row.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="cursor-help font-serif text-lg font-bold tracking-[0.08em] text-white underline decoration-white/50 decoration-dotted underline-offset-4">
        {groupName}
      </span>

      {isHovered ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(760px,calc(100vw-3rem))] rounded-2xl border border-slate-900/12 bg-white p-5 text-sm font-normal text-slate-800 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
          <h4 className="mb-4 font-semibold text-slate-950">
            {groupName} - classement a l&apos;instant t
          </h4>

          <div className="space-y-5">
            {renderStandingsTable("Classement prono", predictedStandings)}

            <div className="border-t border-slate-200 pt-4">
              {renderStandingsTable("Classement reel", actualStandings)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
