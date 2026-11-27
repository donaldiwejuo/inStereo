// Weekly mood (Pulse) helpers and the 7-day bar graph, shared by the Pulse
// tab and the Pulse section of a person's sheet.
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts } from "../theme";

export type MoodMap = Record<string, number>; // YYYY-MM-DD → 1-5

export const MOOD_LABELS: Record<number, string> = { 1: "Struggling", 2: "Low", 3: "Okay", 4: "Good", 5: "Thriving" };
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Monday of the current week as ISO date string */
export function weekStartStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split("T")[0];
}

/** Returns Mon–Sun ISO date strings for the current week */
export function currentWeekDays(): string[] {
  const monday = new Date(weekStartStr() + "T12:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function weekStats(scores: MoodMap | undefined) {
  const days = currentWeekDays();
  const logged = days.map((d) => scores?.[d]).filter((v): v is number => typeof v === "number");
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null;
  const latest = [...days].reverse().map((d) => scores?.[d]).find((v) => typeof v === "number");
  // Gently flag someone whose week is trending low, or whose latest check-in was low.
  const needsCare = (avg !== null && avg <= 2.5) || (latest !== undefined && latest <= 2);
  return { days, logged: logged.length, avg, needsCare };
}

function barColor(score: number): string {
  if (score <= 2) return colors.warm;
  if (score === 3) return colors.textFaint;
  return colors.accent;
}

// ─── Weekly bar graph ────────────────────────────────────────────────────────

export function WeekBars({ scores, height = 64, selectedDay, onDayPress }: {
  scores: MoodMap | undefined; height?: number; selectedDay?: string; onDayPress?: (day: string) => void;
}) {
  const days = currentWeekDays();
  const today = todayStr();
  return (
    <View style={g.row}>
      {days.map((day, i) => {
        const score = scores?.[day];
        const selected = day === selectedDay;
        const bar = (
          <>
            <View style={[g.track, { height }]}>
              {score ? (
                <View style={[g.bar, { height: (score / 5) * height, backgroundColor: barColor(score) }]} />
              ) : (
                <View style={g.emptyDot} />
              )}
            </View>
            <Text style={[g.label, (day === today || selected) && g.labelStrong]}>{DAY_LABELS[i]}</Text>
          </>
        );
        return onDayPress ? (
          <TouchableOpacity
            key={day}
            style={[g.col, selected && g.colSelected]}
            onPress={() => onDayPress(day)}
            accessibilityLabel={`${DAY_NAMES[i]}${score ? `, ${MOOD_LABELS[score]}` : ", not logged"}`}
          >
            {bar}
          </TouchableOpacity>
        ) : (
          <View key={day} style={g.col}>{bar}</View>
        );
      })}
    </View>
  );
}

const g = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  col: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 4, borderRadius: 10 },
  colSelected: { backgroundColor: colors.background },
  track: { width: 14, justifyContent: "flex-end", alignItems: "center" },
  bar: { width: 14, borderRadius: 7 },
  emptyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border, marginBottom: 2 },
  label: { fontFamily: fonts.sans, fontSize: 11, color: colors.textFaint },
  labelStrong: { fontFamily: fonts.sansBold, color: colors.text },
});

