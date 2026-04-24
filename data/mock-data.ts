export type Match = {
  id: number;
  phase: string;
  teamA: string;
  teamB: string;
  kickoffAt: string;
};

export const matches: Match[] = [
  {
    id: 1,
    phase: "Groupes",
    teamA: "Mexique",
    teamB: "Japon",
    kickoffAt: "2026-06-12T18:00:00Z",
  },
  {
    id: 2,
    phase: "Groupes",
    teamA: "France",
    teamB: "Brésil",
    kickoffAt: "2026-06-13T19:00:00Z",
  },
  {
    id: 3,
    phase: "Groupes",
    teamA: "Canada",
    teamB: "Portugal",
    kickoffAt: "2026-06-14T20:00:00Z",
  },
];