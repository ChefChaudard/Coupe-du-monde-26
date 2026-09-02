const ODDS_API_TEAM_NAME_MAP: Record<string, string> = {
  "Inter Milan": "Inter",
  "Barcelona": "FC Barcelona",
  "VfB Stuttgart": "Stuttgart",
  "Viking FK": "Viking",
  "Atl\u00e9tico Madrid": "Atl\u00e9tico de Madrid",
  "Sporting Lisbon": "Sporting CP",
  "Paris Saint Germain": "Paris Saint-Germain",
  "\u0160K Slovan Bratislava": "Slovan Bratislava",
  "Fenerbahce": "Fenerbah\u00e7e",
  "AS Roma": "Roma",
  "Bayern Munich": "Bayern M\u00fcnchen",
  "RB Leipzig": "Leipzig",
  "Sabah FK": "Sabah",
  "RC Lens": "Lens",
};

export function mapOddsApiTeamName(oddsApiName: string) {
  return ODDS_API_TEAM_NAME_MAP[oddsApiName] ?? oddsApiName;
}