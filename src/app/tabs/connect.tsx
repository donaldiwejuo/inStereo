import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { currentWeekDays, DAY_NAMES, MOOD_LABELS, todayStr, WeekBars, weekStartStr, weekStats } from "../../components/pulse";
import { Avatar, Card, ScreenHeading, ui } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { Member, useMembers } from "../../context/MembersContext";
import { updateUserProfile } from "../../lib/firestore";
import { colors, fonts, radius, tintFor, type } from "../../theme";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const MY_MOOD_KEY = "instereo_my_mood";
const MY_NOTES_KEY = "instereo_my_notes";
const REMINDER_KEY = "instereo_mood_reminder";
type MoodMap = Record<string, number>;
type NotesMap = Record<string, string>; // weekStartISO → string


// ─── A person's week ─────────────────────────────────────────────────────────

function PersonPulse({ member }: { member: Member }) {
  const { avg, logged, needsCare } = weekStats(member.pulseScores);
  return (
    <View style={[p.card, { backgroundColor: tintFor(member.id) }, needsCare && p.cardCare]}>
      <View style={p.top}>
        <Avatar person={member} size={44} ring />
        <View style={{ flex: 1 }}>
          <Text style={p.name} numberOfLines={1}>{member.name}</Text>
          <Text style={type.caption} numberOfLines={1}>{member.relationship}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={p.avg}>{avg !== null ? avg.toFixed(1) : "—"}</Text>
          <Text style={p.avgLabel}>{logged ? `avg · ${logged}/7 days` : "no check-ins"}</Text>
        </View>
      </View>
      <WeekBars scores={member.pulseScores} height={44} />
      {needsCare && (
        <View style={p.careRow}>
          <Ionicons name="heart-outline" size={15} color={colors.warm} />
          <Text style={p.careText}>Their week has been tough. Maybe check in?</Text>
        </View>
      )}
      {member.weeklyNote ? <Text style={p.note} numberOfLines={3}>“{member.weeklyNote}”</Text> : null}
    </View>
  );
}

const p = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 18, gap: 16, marginBottom: 14, borderWidth: 1, borderColor: "transparent" },
  cardCare: { borderColor: colors.warm + "66" },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  avg: { fontFamily: fonts.serif, fontSize: 30, color: colors.text, lineHeight: 34 },
  avgLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted },
  careRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  careText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.warm, flex: 1 },
  note: { fontFamily: fonts.serifRegular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PulseScreen() {
  const { user } = useAuth();
  const { members } = useMembers();
  const [moodMap, setMoodMap] = useState<MoodMap>({});
  const [notesMap, setNotesMap] = useState<NotesMap>({});
  const [reminderOn, setReminderOn] = useState(false);
  const [selectedDay, setSelectedDay] = useState(todayStr());
  const today = todayStr();
  const weekStart = weekStartStr();
  const selectedScore = moodMap[selectedDay];
  const [noteText, setNoteText] = useState(notesMap[weekStart] ?? "");
  const noteInitRef = useRef(false);

  useEffect(() => {
    AsyncStorage.multiGet([MY_MOOD_KEY, MY_NOTES_KEY, REMINDER_KEY]).then(
      async ([[, mood], [, notes], [, reminder]]) => {
        if (mood) {
          try {
            const parsed: MoodMap = JSON.parse(mood);
            const weekDays = new Set(currentWeekDays());
            const filtered: MoodMap = {};
            Object.keys(parsed).forEach((d) => { if (weekDays.has(d)) filtered[d] = parsed[d]; });
            setMoodMap(filtered);
            if (Object.keys(filtered).length !== Object.keys(parsed).length) {
              await AsyncStorage.setItem(MY_MOOD_KEY, JSON.stringify(filtered));
            }
          } catch {}
        }
        if (notes) {
          try {
            const parsed: NotesMap = JSON.parse(notes);
            setNotesMap(parsed);
            if (!noteInitRef.current) {
              setNoteText(parsed[weekStart] ?? "");
              noteInitRef.current = true;
            }
          } catch {}
        }
        if (reminder) setReminderOn(reminder === "true");
      }
    );
  }, []);

  async function logMood(day: string, score: number) {
    const newMap: MoodMap = { ...moodMap, [day]: score };
    setMoodMap(newMap);
    await AsyncStorage.setItem(MY_MOOD_KEY, JSON.stringify(newMap));
    if (user) updateUserProfile(user.uid, { pulseScores: newMap });
  }

  async function saveNote() {
    if (user) updateUserProfile(user.uid, { weeklyNote: noteText });
    const newMap: NotesMap = { ...notesMap, [weekStart]: noteText };
    setNotesMap(newMap);
    await AsyncStorage.setItem(MY_NOTES_KEY, JSON.stringify(newMap));
  }

  async function toggleReminder(val: boolean) {
    setReminderOn(val);
    await AsyncStorage.setItem(REMINDER_KEY, val ? "true" : "false");
    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        await Notifications.scheduleNotificationAsync({
          content: { title: "inStereo", body: "How are you feeling today?" },
          trigger: { type: "daily", hour: 20, minute: 0 } as Parameters<typeof Notifications.scheduleNotificationAsync>[0]["trigger"],
        });
      }
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }

  const mine = weekStats(moodMap);
  const dayName = selectedDay === today ? "today" : `on ${DAY_NAMES[currentWeekDays().indexOf(selectedDay)] ?? "that day"}`;
  // People who may need care come first.
  const sorted = [...members].sort((a, b) => Number(weekStats(b.pulseScores).needsCare) - Number(weekStats(a.pulseScores).needsCare));

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <ScreenHeading eyebrow="Pulse" title="How everyone's doing." subtitle="A gentle weekly check-in, shared only with your people." />

        <View style={s.body}>
          <Card style={{ gap: 14 }}>
            <Text style={ui.sectionTitle}>How are you feeling {dayName}?</Text>
            <View style={s.scoreRow}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = selectedScore === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[s.scoreBtn, active && s.scoreBtnActive]}
                    onPress={() => logMood(selectedDay, n)}
                    activeOpacity={0.75}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.scoreNum, active && { color: colors.onPrimary }]}>{n}</Text>
                    <Text style={[s.scoreDesc, active && { color: colors.onPrimary }]} numberOfLines={1}>{MOOD_LABELS[n]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.divider} />
            <View style={s.weekHeader}>
              <Text style={type.caption}>Your week · tap a day to change it</Text>
              <Text style={s.myAvg}>{mine.avg !== null ? `${mine.avg.toFixed(1)} avg` : ""}</Text>
            </View>
            <WeekBars scores={moodMap} selectedDay={selectedDay} onDayPress={setSelectedDay} />
            <TextInput
              style={s.noteInput}
              multiline
              placeholder="A note for your people this week…"
              placeholderTextColor={colors.textFaint}
              value={noteText}
              onChangeText={setNoteText}
              onBlur={saveNote}
            />
          </Card>

          <View style={s.sectionHeader}>
            <Text style={type.sectionTitle}>Your people this week</Text>
          </View>
          {sorted.length === 0 ? (
            <Text style={type.caption}>When you connect with someone, their weekly check-ins show up here.</Text>
          ) : (
            sorted.map((m) => <PersonPulse key={m.id} member={m} />)
          )}

          <Card style={s.reminderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
              <Text style={s.reminderLabel}>Daily reminder at 8 PM</Text>
            </View>
            <Switch
              value={reminderOn}
              onValueChange={toggleReminder}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.onPrimary}
            />
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 22 },
  scoreRow: { flexDirection: "row", gap: 6 },
  scoreBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, gap: 4,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  scoreBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scoreNum: { fontFamily: fonts.serif, fontSize: 22, color: colors.text },
  scoreDesc: { fontFamily: fonts.sans, fontSize: 10, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  weekHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  myAvg: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text },
  noteInput: {
    fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: colors.text, minHeight: 70,
    textAlignVertical: "top", backgroundColor: colors.background, borderRadius: 14, padding: 12,
  },
  sectionHeader: { marginTop: 30, marginBottom: 14 },
  reminderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  reminderLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text },
});
