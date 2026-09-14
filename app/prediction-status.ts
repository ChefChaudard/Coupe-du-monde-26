import { isGroupPhase } from "@/lib/phase";

// Les 8 vrais pronostiqueurs. Il n'existe pas de filtre "joueur reel" fiable
// en base (roles/is_admin ne l'excluent pas proprement, cf. le compte de
// test "Mme Claude"), donc la liste est volontairement figee ici. A mettre
// a jour si la liste des joueurs change.
const REAL_PLAYER_NICKNAMES = [
  "Alex",
  "Chaudard",
  "DonCesar",
  "JaimeLaVar",
  "Juanigoal",
  "Ludo",
  "Sandy",
  "Zekinho",
];

// Meme decoupage que MobilePredictionForm.tsx (JOURNEE_SIZE = 18, chunk
// index < 8 => J1..J8, tout le reste => JB) : il n'existe pas de colonne
// "journee" en base, seulement un ordre chronologique par kickoff_at.
const JOURNEE_SIZE = 18;

// Phases du 2e tour reel suivies par ce rapport (prefixees "Reel - " en
// base, cf. app/real-knockout/page.tsx). Le "16e de finale" et le "match
// pour la 3eme place" existent aussi en base mais ne sont pas demandes ici.
const REAL_PHASE_PARTS: { key: string; label: string; phase: string }[] = [
  { key: "reel-8e", label: "8emes reel", phase: "8e de finale" },
  { key: "reel-quarts", label: "Quarts reel", phase: "Quarts de finale" },
  { key: "reel-demi", label: "Demi reel", phase: "Demi-finales" },
  { key: "reel-finale", label: "Finale reel", phase: "Finale" },
];

export type MatchRow = {
  id: number;
  phase: string;
  kickoff_at: string;
};

export type PredictionRow = {
  user_id: string;
  match_id: number;
};

export type ProfileRow = {
  id: string;
  nickname: string;
};

export type PredictionStatusPart = {
  key: string;
  label: string;
  total: number;
};

export type PredictionStatusRow = {
  nickname: string;
  // pourcentage 0-100 arrondi, ou null si la partie n'a aucun match (rien a
  // saisir pour le moment, ex: tour reel pas encore atteint).
  percentagesByPart: Record<string, number | null>;
};

export type PredictionStatusPayload = {
  parts: PredictionStatusPart[];
  rows: PredictionStatusRow[];
};

export function computePredictionStatus(
  matches: MatchRow[],
  predictions: PredictionRow[],
  profiles: ProfileRow[]
): PredictionStatusPayload {
  // 1) Regroupe les matchs "phase de ligue"/"barrage" par journee (meme
  // logique de decoupage que l'ecran de saisie mobile).
  const groupMatches = matches
    .filter((match) => isGroupPhase(match.phase))
    .sort((a, b) => {
      const kickoffDiff =
        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
      return kickoffDiff !== 0 ? kickoffDiff : a.id - b.id;
    });

  const journeeMatchIdsByLabel = new Map<string, number[]>();
  for (let i = 0; i < groupMatches.length; i += JOURNEE_SIZE) {
    const chunkIndex = i / JOURNEE_SIZE;
    const label = chunkIndex < 8 ? `J${chunkIndex + 1}` : "JB";
    const chunk = groupMatches.slice(i, i + JOURNEE_SIZE);
    const existing = journeeMatchIdsByLabel.get(label) ?? [];
    journeeMatchIdsByLabel.set(label, [
      ...existing,
      ...chunk.map((match) => match.id),
    ]);
  }

  const journeeLabels = [
    "J1",
    "J2",
    "J3",
    "J4",
    "J5",
    "J6",
    "J7",
    "J8",
    "JB",
  ];

  const parts: PredictionStatusPart[] = journeeLabels.map((label) => ({
    key: label,
    label,
    total: (journeeMatchIdsByLabel.get(label) ?? []).length,
  }));

  // 2) Ajoute les 4 tours du 2e tour reel demandes.
  for (const realPart of REAL_PHASE_PARTS) {
    const targetPhase = `Reel - ${realPart.phase}`;
    const matchIds = matches
      .filter((match) => match.phase === targetPhase)
      .map((match) => match.id);

    parts.push({
      key: realPart.key,
      label: realPart.label,
      total: matchIds.length,
    });
    journeeMatchIdsByLabel.set(realPart.key, matchIds);
  }

  // 3) Associe chaque match_id a la partie qui le contient (un match
  // n'appartient qu'a une seule partie).
  const partKeyByMatchId = new Map<number, string>();
  for (const [partKey, matchIds] of journeeMatchIdsByLabel.entries()) {
    for (const matchId of matchIds) {
      partKeyByMatchId.set(matchId, partKey);
    }
  }

  // 4) Compte, par joueur et par partie, le nombre de pronostics saisis.
  const enteredCountByUserAndPart = new Map<string, Map<string, number>>();
  for (const prediction of predictions) {
    const partKey = partKeyByMatchId.get(prediction.match_id);
    if (!partKey) continue;

    let userCounts = enteredCountByUserAndPart.get(prediction.user_id);
    if (!userCounts) {
      userCounts = new Map<string, number>();
      enteredCountByUserAndPart.set(prediction.user_id, userCounts);
    }
    userCounts.set(partKey, (userCounts.get(partKey) ?? 0) + 1);
  }

  const userIdByNickname = new Map(
    profiles.map((profile) => [profile.nickname, profile.id])
  );

  const rows: PredictionStatusRow[] = REAL_PLAYER_NICKNAMES.map(
    (nickname) => {
      const userId = userIdByNickname.get(nickname);
      const userCounts = userId
        ? enteredCountByUserAndPart.get(userId)
        : undefined;

      const percentagesByPart: Record<string, number | null> = {};
      for (const part of parts) {
        if (part.total === 0) {
          percentagesByPart[part.key] = null;
          continue;
        }
        const entered = userCounts?.get(part.key) ?? 0;
        percentagesByPart[part.key] = Math.round(
          (entered / part.total) * 100
        );
      }

      return { nickname, percentagesByPart };
    }
  );

  return { parts, rows };
}
