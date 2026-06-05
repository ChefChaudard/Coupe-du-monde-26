export type RealLaterPhase =
  | "8e de finale"
  | "Quarts de finale"
  | "Demi-finales"
  | "Finale";

export type RealLaterFixture = {
  kickoff_at: string;
  venue: string;
  city: string;
};

export type RealRound32Fixture = RealLaterFixture;

export type RealMatchLike = {
  id: number;
  phase: string;
  kickoff_at?: string | null;
  venue?: string | null;
  city?: string | null;
};

const fixtures: Record<RealLaterPhase, RealLaterFixture[]> = {
  "8e de finale": [
    { kickoff_at: "2026-07-04T20:00:00.000Z", venue: "Boston Stadium", city: "Boston" },
    { kickoff_at: "2026-07-04T20:00:00.000Z", venue: "Houston Stadium", city: "Houston" },
    { kickoff_at: "2026-07-05T20:00:00.000Z", venue: "Atlanta Stadium", city: "Atlanta" },
    { kickoff_at: "2026-07-05T20:00:00.000Z", venue: "Dallas Stadium", city: "Dallas" },
    { kickoff_at: "2026-07-06T20:00:00.000Z", venue: "Los Angeles Stadium", city: "Los Angeles" },
    { kickoff_at: "2026-07-06T20:00:00.000Z", venue: "Mexico City Stadium", city: "Mexico City" },
    { kickoff_at: "2026-07-07T20:00:00.000Z", venue: "Seattle Stadium", city: "Seattle" },
    {
      kickoff_at: "2026-07-07T20:00:00.000Z",
      venue: "New York New Jersey Stadium",
      city: "New Jersey",
    },
  ],
  "Quarts de finale": [
    { kickoff_at: "2026-07-10T20:00:00.000Z", venue: "Toronto Stadium", city: "Toronto" },
    { kickoff_at: "2026-07-10T20:00:00.000Z", venue: "Vancouver Stadium", city: "Vancouver" },
    { kickoff_at: "2026-07-11T20:00:00.000Z", venue: "Miami Stadium", city: "Miami" },
    { kickoff_at: "2026-07-11T20:00:00.000Z", venue: "Kansas City Stadium", city: "Kansas City" },
  ],
  "Demi-finales": [
    { kickoff_at: "2026-07-15T20:00:00.000Z", venue: "Los Angeles Stadium", city: "Los Angeles" },
    {
      kickoff_at: "2026-07-15T20:00:00.000Z",
      venue: "New York New Jersey Stadium",
      city: "New Jersey",
    },
  ],
  Finale: [
    {
      kickoff_at: "2026-07-19T20:00:00.000Z",
      venue: "New York New Jersey Stadium",
      city: "New Jersey",
    },
  ],
};

const roundOf32Fixtures: RealRound32Fixture[] = [
  { kickoff_at: "2026-06-28T20:00:00.000Z", venue: "Los Angeles Stadium", city: "Los Angeles" },
  { kickoff_at: "2026-06-29T20:00:00.000Z", venue: "Boston Stadium", city: "Boston" },
  { kickoff_at: "2026-06-29T20:00:00.000Z", venue: "Estadio Monterrey", city: "Monterrey" },
  { kickoff_at: "2026-06-29T20:00:00.000Z", venue: "Houston Stadium", city: "Houston" },
  { kickoff_at: "2026-06-30T20:00:00.000Z", venue: "New York New Jersey Stadium", city: "New Jersey" },
  { kickoff_at: "2026-06-30T20:00:00.000Z", venue: "Dallas Stadium", city: "Dallas" },
  { kickoff_at: "2026-06-30T20:00:00.000Z", venue: "Mexico City Stadium", city: "Mexico City" },
  { kickoff_at: "2026-07-01T20:00:00.000Z", venue: "Atlanta Stadium", city: "Atlanta" },
  { kickoff_at: "2026-07-01T20:00:00.000Z", venue: "San Francisco Bay Area Stadium", city: "San Francisco" },
  { kickoff_at: "2026-07-01T20:00:00.000Z", venue: "Seattle Stadium", city: "Seattle" },
  { kickoff_at: "2026-07-02T20:00:00.000Z", venue: "Toronto Stadium", city: "Toronto" },
  { kickoff_at: "2026-07-02T20:00:00.000Z", venue: "Los Angeles Stadium", city: "Los Angeles" },
  { kickoff_at: "2026-07-02T20:00:00.000Z", venue: "BC Place Vancouver", city: "Vancouver" },
  { kickoff_at: "2026-07-03T20:00:00.000Z", venue: "Miami Stadium", city: "Miami" },
  { kickoff_at: "2026-07-03T20:00:00.000Z", venue: "Kansas City Stadium", city: "Kansas City" },
  { kickoff_at: "2026-07-03T20:00:00.000Z", venue: "Dallas Stadium", city: "Dallas" },
];

export function getRealLaterFixture(phase: RealLaterPhase, index: number) {
  return fixtures[phase][index] ?? null;
}

export function getRealRound32Fixture(index: number) {
  return roundOf32Fixtures[index] ?? null;
}

export function getRealLaterPhaseMatches(matches: RealMatchLike[]) {
  return (["8e de finale", "Quarts de finale", "Demi-finales", "Finale"] as RealLaterPhase[]).flatMap(
    (phase) => {
      const phaseMatches = matches
        .filter((match) => match.phase === `Reel - ${phase}`)
        .slice()
        .sort((a, b) => {
          const kickoffDiff =
            new Date(a.kickoff_at ?? "").getTime() -
            new Date(b.kickoff_at ?? "").getTime();
          if (kickoffDiff !== 0) return kickoffDiff;
          return a.id - b.id;
        });

      return phaseMatches.map((match, index) => ({
        id: match.id,
        phase,
        fixture: getRealLaterFixture(phase, index),
      }));
    }
  );
}