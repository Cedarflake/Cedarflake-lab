export function formatDateTime(
  value: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(new Date(value));
}

export function formatDateRange(start: string, end: string, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(new Date(start))} → ${formatter.format(new Date(end))}`;
}

export function formatDurationMinutes(minutes: number, locale: string) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return new Intl.NumberFormat(locale).format(remainder) + "m";
  }

  if (remainder === 0) {
    return new Intl.NumberFormat(locale).format(hours) + "h";
  }

  return `${new Intl.NumberFormat(locale).format(hours)}h ${new Intl.NumberFormat(locale).format(remainder)}m`;
}

export function formatCountdown(target: string, locale: string, now = new Date()) {
  const diff = new Date(target).getTime() - now.getTime();

  if (diff <= 0) {
    return locale.startsWith("zh") ? "维护窗口即将开始" : "Starting soon";
  }

  const totalMinutes = Math.ceil(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return locale.startsWith("zh")
      ? `${days}天 ${hours}小时后开始`
      : `Starts in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return locale.startsWith("zh")
      ? `${hours}小时 ${minutes}分钟后开始`
      : `Starts in ${hours}h ${minutes}m`;
  }

  return locale.startsWith("zh")
    ? `${minutes}分钟后开始`
    : `Starts in ${minutes}m`;
}

export function formatCalendarDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatRelativeTime(value: string, locale: string, now = new Date()) {
  const target = new Date(value).getTime();
  const diffMs = target - now.getTime();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, {numeric: "auto"});

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs >= year) {
    return rtf.format(Math.round(diffMs / year), "year");
  }

  if (absMs >= month) {
    return rtf.format(Math.round(diffMs / month), "month");
  }

  if (absMs >= week) {
    return rtf.format(Math.round(diffMs / week), "week");
  }

  if (absMs >= day) {
    return rtf.format(Math.round(diffMs / day), "day");
  }

  if (absMs >= hour) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }

  return rtf.format(Math.round(diffMs / minute), "minute");
}
