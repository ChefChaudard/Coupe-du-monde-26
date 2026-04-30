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
  standings,
}: {
  groupName: string;
  standings: StandingRow[];
}) {
  return (
    <div className="group relative inline-block">
      <span className="cursor-help font-semibold underline decoration-dotted underline-offset-4">
        {groupName}
      </span>

      <div className="invisible absolute left-0 top-full z-50 mt-2 w-[min(620px,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal text-slate-800 shadow-xl opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100">
        <h4 className="mb-2 font-semibold">
          {groupName} - classement a l&apos;instant t
        </h4>

        {standings.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune donnee disponible.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-1 pr-2">Equipe</th>
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
                <tr key={row.team} className="border-b last:border-b-0">
                  <td className="py-1 pr-2 font-medium">{row.team}</td>
                  <td className="px-1 text-center">{row.played}</td>
                  <td className="px-1 text-center">{row.won}</td>
                  <td className="px-1 text-center">{row.drawn}</td>
                  <td className="px-1 text-center">{row.lost}</td>
                  <td className="px-1 text-center">{row.goalsFor}</td>
                  <td className="px-1 text-center">{row.goalsAgainst}</td>
                  <td className="px-1 text-center">{row.goalDifference}</td>
                  <td className="pl-1 text-center font-bold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
