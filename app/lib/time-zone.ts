export const DEFAULT_TIME_ZONE = "Europe/Paris";
export const USER_TIME_ZONE_UPDATED_EVENT = "user-time-zone-updated";

const timeZoneOptions = [
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Europe/London", label: "Londres" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "America/New_York", label: "New York" },
  { value: DEFAULT_TIME_ZONE, label: "Paris" },
  { value: "America/Los_Angeles", label: "San-Francisco" },
];

export function getTimeZoneOptions() {
  return timeZoneOptions.map((option) => option.value);
}

export function isValidTimeZone(value: string) {
  return timeZoneOptions.some((option) => option.value === value);
}

export function getSafeTimeZone(value?: string | null) {
  return value && isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

export function formatTimeZoneLabel(timeZone: string) {
  return (
    timeZoneOptions.find((option) => option.value === timeZone)?.label ??
    timeZone.replaceAll("_", " ")
  );
}

export function formatDashboardDate(value: string, timeZone: string) {
  const date = new Date(value);
  const safeTimeZone = getSafeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: safeTimeZone,
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const day = getPart("day");
  const month = getPart("month");
  const hours = getPart("hour");
  const minutes = getPart("minute");

  return `${day} ${month} - ${hours}h${minutes}`;
}

export function formatMatchDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: getSafeTimeZone(timeZone),
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function formatMatchTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: getSafeTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMatchDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: getSafeTimeZone(timeZone),
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
