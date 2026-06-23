import { getGroupMatchCity } from "./fifa-group-cities";

const venueCityMap: Record<string, string> = {
  "Mexico City Stadium": "Mexico City",
  "Guadalajara Stadium": "Guadalajara",
  "Estadio Guadalajara": "Guadalajara",
  "Toronto Stadium": "Toronto",
  "Los Angeles Stadium": "Los Angeles",
  "San Francisco Bay Area Stadium": "San Francisco Bay Area",
  "BC Place Vancouver": "Vancouver",
  "Boston Stadium": "Boston",
  "Houston Stadium": "Houston",
  "Dallas Stadium": "Dallas",
  "New York New Jersey Stadium": "New Jersey",
  "New York/New Jersey Stadium": "New Jersey",
  "Philadelphia Stadium": "Philadelphia",
  "Monterrey Stadium": "Monterrey",
  "Estadio Monterrey": "Monterrey",
  "Seattle Stadium": "Seattle",
  "Miami Stadium": "Miami",
  "Kansas City Stadium": "Kansas City",
  "Atlanta Stadium": "Atlanta",
  // Official knockout-stage venue names (round of 32 onwards)
  "SoFi Stadium": "Los Angeles",
  "Gillette Stadium": "Boston",
  "Estadio BBVA": "Monterrey",
  "NRG Stadium": "Houston",
  "MetLife Stadium": "New Jersey",
  "AT&T Stadium": "Dallas",
  "Estadio Azteca": "Mexico City",
  "Mercedes-Benz Stadium": "Atlanta",
  "Levi's Stadium": "San Francisco",
  "Lumen Field": "Seattle",
  "BMO Field": "Toronto",
  "BC Place": "Vancouver",
  "Hard Rock Stadium": "Miami",
  "Arrowhead Stadium": "Kansas City",
};

function normalizeVenue(venue: string) {
  return venue.replace(/\s+/g, " ").trim();
}

export function getMatchCity(
  venue?: string | null,
  city?: string | null,
  teamA?: string | null,
  teamB?: string | null
) {
  if (city) return city;
  const groupCity = getGroupMatchCity(teamA ?? undefined, teamB ?? undefined);
  if (groupCity) return groupCity;
  if (!venue) return "-";

  const normalizedVenue = normalizeVenue(venue);
  return venueCityMap[normalizedVenue] ?? normalizedVenue;
}