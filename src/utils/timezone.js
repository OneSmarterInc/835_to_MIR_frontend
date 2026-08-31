export const EASTERN_TIME_ZONE = 'America/New_York';

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || EASTERN_TIME_ZONE;
  } catch {
    return EASTERN_TIME_ZONE;
  }
}

export function isUnitedStatesTimeZone(zone = browserTimeZone()) {
  return /^(America\/(New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Metlakatla|Nome|Sitka|Yakutat|Adak)|Pacific\/Honolulu|US\/)/.test(zone);
}

export function shouldShowTimeZoneSelector(zone = browserTimeZone()) {
  return !isUnitedStatesTimeZone(zone);
}

function validDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatInZone(date, timeZone, includeSeconds = false) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    timeZoneName: 'short',
  }).format(date);
}

export function formatDateTimeWithZones(value, options = {}) {
  const date = validDate(value);
  if (!date) return value || '—';
  const localZone = options.localTimeZone || browserTimeZone();
  const eastern = `Eastern: ${formatInZone(date, EASTERN_TIME_ZONE, options.includeSeconds)}`;
  if (isUnitedStatesTimeZone(localZone) || localZone === EASTERN_TIME_ZONE) return eastern;
  return `${eastern} · Local (${localZone}): ${formatInZone(date, localZone, options.includeSeconds)}`;
}

export function formatEasternDate(value) {
  const date = validDate(value);
  if (!date) return value || '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function timeZoneDisplayName(zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'long',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value || zone;
  } catch {
    return zone;
  }
}

export function scheduleTimeZoneOptions() {
  const local = browserTimeZone();
  const zones = [
    EASTERN_TIME_ZONE,
    local,
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'UTC',
  ];
  return [...new Set(zones)].map((value) => ({
    value,
    label: `${timeZoneDisplayName(value)} (${value})`,
  }));
}

export function scheduleTimeLabel(time, zone = EASTERN_TIME_ZONE) {
  if (!time) return 'N/A';
  return `${time} — ${timeZoneDisplayName(zone)} (${zone})`;
}
