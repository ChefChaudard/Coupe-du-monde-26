import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/roles";
import { mapOddsApiTeamName } from "@/lib/odds-team-map";

const ODDS_API_SPORT = "soccer_uefa_champs_league";
const ODDS_API_BOOKMAKER = "unibet_fr";

type OddsApiOutcome = {
  name: string;
  price: number;
};

type OddsApiEvent = {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    markets: { key: string; outcomes: OddsApiOutcome[] }[];
  }[];
};

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, roles, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!isAdmin(profile ?? undefined)) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "ODDS_API_KEY manquante côté serveur." }, { status: 500 });
  }

  const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds/?apiKey=${apiKey}&regions=eu,uk&bookmakers=${ODDS_API_BOOKMAKER}&markets=h2h&oddsFormat=decimal`;

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      { error: `Erreur The Odds API (${response.status}): ${errorText}` },
      { status: 502 }
    );
  }

  const events = (await response.json()) as OddsApiEvent[];

  const adminSupabase = createAdminClient();

  const { data: matches, error: matchesError } = await adminSupabase
    .from("matches")
    .select("id, team_a, team_b")
    .eq("is_finished", false);

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  let updatedCount = 0;
  const unmatchedEvents: string[] = [];

  for (const event of events) {
    const bookmaker = event.bookmakers.find((b) => b.key === ODDS_API_BOOKMAKER);
    const market = bookmaker?.markets.find((m) => m.key === "h2h");

    if (!market) continue;

    const homeTeam = mapOddsApiTeamName(event.home_team);
    const awayTeam = mapOddsApiTeamName(event.away_team);

    const match = matches?.find(
      (m) => m.team_a === homeTeam && m.team_b === awayTeam
    );

    if (!match) {
      unmatchedEvents.push(`${event.home_team} vs ${event.away_team}`);
      continue;
    }

    const homeOutcome = market.outcomes.find((o) => o.name === event.home_team);
    const awayOutcome = market.outcomes.find((o) => o.name === event.away_team);
    const drawOutcome = market.outcomes.find((o) => o.name === "Draw");

    if (!homeOutcome || !awayOutcome || !drawOutcome) continue;

    const { error: updateError } = await adminSupabase
      .from("matches")
      .update({
        odds_home: homeOutcome.price,
        odds_draw: drawOutcome.price,
        odds_away: awayOutcome.price,
        odds_bookmaker: ODDS_API_BOOKMAKER,
        odds_updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    if (!updateError) {
      updatedCount += 1;
    }
  }

  return NextResponse.json({
    updated: updatedCount,
    totalEvents: events.length,
    unmatchedEvents,
  });
}