export type RealLaterPhase =
  | "8e de finale"
  | "Quarts de finale"
  | "Demi-finales"
  | "Match pour la troisième place"
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
    // Match 89
    { kickoff_at: "2026-07-04T21:00:00.000Z", venue: "Philadelphia Stadium", city: "Philadelphia" },
    // Match 90
    { kickoff_at: "2026-07-04T17:00:00.000Z", venue: "Toronto Stadium", city: "Toronto" },
    // Match 91
    { kickoff_at: "2026-07-05T20:00:00.000Z", venue: "Houston Stadium", city: "Houston" },
    // Match 92
    { kickoff_at: "2026-07-06T00:00:00.000Z", venue: "Estadio Azteca", city: "Mexico City" },
    // Match 93
    { kickoff_at: "2026-07-06T19:00:00.000Z", venue: "Dallas Stadium", city: "Dallas" },
    // Match 94
    { kickoff_at: "2026-07-07T00:00:00.000Z", venue: "Atlanta Stadium", city: "Atlanta" },
    // Match 95
    { kickoff_at: "2026-07-07T16:00:00.000Z", venue: "Seattle Stadium", city: "Seattle" },
    // Match 96
    { kickoff_at: "2026-07-07T20:00:00.000Z", venue: "Vancouver Stadium", city: "Vancouver" },
  ],
  "Quarts de finale": [
    // Match 97
    { kickoff_at: "2026-07-09T20:00:00.000Z", venue: "Boston Stadium", city: "Boston" },
    // Match 98
    { kickoff_at: "2026-07-10T19:00:00.000Z", venue: "Kansas City Stadium", city: "Kansas City" },
    // Match 99
    { kickoff_at: "2026-07-11T21:00:00.000Z", venue: "Miami Stadium", city: "Miami" },
    // Match 100
    { kickoff_at: "2026-07-12T01:00:00.000Z", venue: "Los Angeles Stadium", city: "Los Angeles" },
  ],
  "Demi-finales": [
    // Match 101
    { kickoff_at: "2026-07-14T19:00:00.000Z", venue: "Dallas Stadium", city: "Dallas" },
    // Match 102
    { kickoff_at: "2026-07-15T19:00:00.000Z", venue: "Atlanta Stadium", city: "Atlanta" },
  ],
  "Match pour la troisième place": [
    // Match 103
    { kickoff_at: "2026-07-18T21:00:00.000Z", venue: "Miami Stadium", city: "Miami" },
  ],
  Finale: [
    // Match 104
    {
      kickoff_at: "2026-07-19T19:00:00.000Z",
      venue: "New York New Jersey Stadium",
      city: "New Jersey",
    },
  ],
};

const roundOf32Fixtures: RealRound32Fixture[] = [
  // Match 73 - 2A vs 2B
  { kickoff_at: "2026-06-28T19:00:00.000Z", venue: "SoFi Stadium", city: "Los Angeles" },
  // Match 74 - 1E vs 3ABCDF
  { kickoff_at: "2026-06-29T20:30:00.000Z", venue: "Gillette Stadium", city: "Boston" },
  // Match 75 - 1F vs 2C
  { kickoff_at: "2026-06-30T01:00:00.000Z", venue: "Estadio BBVA", city: "Monterrey" },
  // Match 76 - 1C vs 2F
  { kickoff_at: "2026-06-29T17:00:00.000Z", venue: "NRG Stadium", city: "Houston" },
  // Match 77 - 1I vs 3CDFGH
  { kickoff_at: "2026-06-30T21:00:00.000Z", venue: "MetLife Stadium", city: "New Jersey" },
  // Match 78 - 2E vs 2I
  { kickoff_at: "2026-06-30T17:00:00.000Z", venue: "AT&T Stadium", city: "Dallas" },
  // Match 79 - 1A vs 3CEFHI
  { kickoff_at: "2026-07-01T01:00:00.000Z", venue: "Estadio Azteca", city: "Mexico City" },
  // Match 80 - 1L vs 3EHIJK
  { kickoff_at: "2026-07-01T16:00:00.000Z", venue: "Mercedes-Benz Stadium", city: "Atlanta" },
  // Match 81 - 1D vs 3BEFIJ
  { kickoff_at: "2026-07-02T00:00:00.000Z", venue: "Levi's Stadium", city: "San Francisco" },
  // Match 82 - 1G vs 3AEHIJ
  { kickoff_at: "2026-07-01T20:00:00.000Z", venue: "Lumen Field", city: "Seattle" },
  // Match 83 - 2K vs 2L
  { kickoff_at: "2026-07-02T23:00:00.000Z", venue: "BMO Field", city: "Toronto" },
  // Match 84 - 1H vs 2J
  { kickoff_at: "2026-07-02T19:00:00.000Z", venue: "SoFi Stadium", city: "Los Angeles" },
  // Match 85 - 1B vs 3EFGIJ
  { kickoff_at: "2026-07-03T03:00:00.000Z", venue: "BC Place", city: "Vancouver" },
  // Match 86 - 1J vs 2H
  { kickoff_at: "2026-07-03T22:00:00.000Z", venue: "Hard Rock Stadium", city: "Miami" },
  // Match 87 - 1K vs 3DEIJL
  { kickoff_at: "2026-07-04T01:30:00.000Z", venue: "Arrowhead Stadium", city: "Kansas City" },
  // Match 88 - 2D vs 2G
  { kickoff_at: "2026-07-03T18:00:00.000Z", venue: "AT&T Stadium", city: "Dallas" },
];

export function getRealLaterFixture(phase: RealLaterPhase, index: number) {
  return fixtures[phase][index] ?? null;
}

export function getRealRound32Fixture(index: number) {
  return roundOf32Fixtures[index] ?? null;
}

export function getRealLaterPhaseMatches(matches: RealMatchLike[]) {
  return (
    [
      "8e de finale",
      "Quarts de finale",
      "Demi-finales",
      "Match pour la troisième place",
      "Finale",
    ] as RealLaterPhase[]
  ).flatMap((phase) => {
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
  });
}