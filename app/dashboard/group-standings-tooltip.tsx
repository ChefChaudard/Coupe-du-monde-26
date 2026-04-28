type StandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
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
      <span className="cursor-help font-semibold underline decoration-dotted">
        {groupName}
      </span>

      <div className="invisible absolute left-0 top-7 z-50 w-[620px] rounded border bg-white p-3 text-sm shadow-xl group-hover:visible">
        <h4 className="mb-2 font-bold">{groupName} - classement</h4>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th>Équipe</th>
              <th>J</th>
              <th>G</th>
              <th>N</th>
              <th>P</th>
              <th>BP</th>
              <th>BC</th>
              <th>Diff</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.team} className="border-b last:border-b-0">
                <td className="py-1 font-medium">{row.team}</td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.goals_for}</td>
                <td>{row.goals_against}</td>
                <td>{row.goal_difference}</td>
                <td className="font-bold">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}