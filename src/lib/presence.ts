// Local time and "is now a good moment to reach them?" for a connection.
import type { Member } from "../context/MembersContext";
import { colors } from "../theme";

export function safeTimezone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; } catch { return "UTC"; }
}

export function localHour(tz: string, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

// Whether now is a good moment to reach this person, from their wake/sleep hours.
export function reachStatus(member: Member, now: Date): { label: string; dot: string } {
  const t = localHour(safeTimezone(member.timezone), now);
  const { wakeHour: wake, sleepHour: sleep } = member;
  if (t >= wake && t < wake + 1) return { label: "Just waking up", dot: colors.warm };
  if (t >= sleep - 1 && t < sleep) return { label: "Winding down", dot: colors.warm };
  if (t >= wake + 1 && t < sleep - 1) return { label: "Good time to reach out", dot: colors.accent };
  return { label: "Probably asleep", dot: colors.textFaint };
}

export function localClock(tz: string | undefined, now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone(tz), hour: "numeric", minute: "2-digit" }).format(now);
}
