import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import PersonDetail from "../../components/PersonDetail";
import { Avatar } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { Member, useMembers } from "../../context/MembersContext";
import { UserProfile, watchUserProfile } from "../../lib/firestore";
import { notifyBirthday } from "../../lib/notifications";
import { reachStatus, safeTimezone } from "../../lib/presence";
import { colors, fonts, radius, space, tintFor, type } from "../../theme";

type IconName = keyof typeof Ionicons.glyphMap;

function weatherCodeInfo(code: number): { icon: IconName; label: string; severe: boolean } {
  if (code === 0) return { icon: "sunny-outline", label: "Clear", severe: false };
  if (code <= 2) return { icon: "partly-sunny-outline", label: "Mostly clear", severe: false };
  if (code === 3 || code === 45 || code === 48) return { icon: "cloud-outline", label: "Cloudy", severe: false };
  if (code === 65 || code === 82) return { icon: "rainy-outline", label: "Heavy rain", severe: true };
  if ((code >= 51 && code <= 63) || code === 80 || code === 81) return { icon: "rainy-outline", label: "Rain", severe: false };
  if (code === 75) return { icon: "snow-outline", label: "Heavy snow", severe: true };
  if (code >= 71 && code <= 77) return { icon: "snow-outline", label: "Snow", severe: false };
  if (code >= 95) return { icon: "thunderstorm-outline", label: "Storm", severe: true };
  return { icon: "partly-sunny-outline", label: "", severe: false };
}

// "You messaged 3 days ago" — a gentle nudge when it's been a while.
function lastMessagedLabel(at: Date | undefined, now: Date): string {
  if (!at) return "You haven't messaged yet";
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return "You messaged just now";
  if (mins < 60) return `You messaged ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `You messaged ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "You messaged yesterday";
  if (days < 30) return `You messaged ${days} days ago`;
  return `You messaged on ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type Weather = { temp: number; icon: IconName; label: string; severe: boolean };

function useWeather(member: Member): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const last = useRef<string>("");

  useEffect(() => {
    const unit = member.country === "United States" ? "fahrenheit" : "celsius";
    let cancelled = false;

    async function load() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${member.lat}&longitude=${member.lon}&current=temperature_2m,weather_code&temperature_unit=${unit}`,
          { signal: controller.signal },
        );
        const d = await r.json();
        if (typeof d?.current?.temperature_2m !== "number") return;
        const temp = Math.round(d.current.temperature_2m);
        const code = typeof d.current.weather_code === "number" ? d.current.weather_code : 0;
        const key = `${temp}:${code}`;
        if (cancelled || key === last.current) return;
        last.current = key;
        setWeather({ temp, ...weatherCodeInfo(code) });
      } catch {
        // Keep showing the last reading; the card simply hides weather if we never got one.
      } finally {
        clearTimeout(timeout);
      }
    }

    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [member.lat, member.lon, member.country]);

  return weather;
}

function PersonCard({ member, now, onPress }: { member: Member; now: Date; onPress: () => void }) {
  const weather = useWeather(member);
  const tz = safeTimezone(member.timezone);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(now);
  const clock = parts.filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal").map((p) => p.value).join("").trim();
  const ampm = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const status = reachStatus(member, now);
  const place = [member.city, member.country].filter(Boolean).join(", ");

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: tintFor(member.id) }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${member.name}, ${clock} ${ampm} in ${member.city}. ${status.label}. ${lastMessagedLabel(member.lastMessagedAt, now)}`}
    >
      <View style={s.cardTop}>
        <Avatar person={member} size={52} ring />
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{member.name}</Text>
          <Text style={s.relationship} numberOfLines={1}>{member.relationship}</Text>
        </View>
        {weather && (
          <View style={s.weather}>
            <Ionicons name={weather.icon} size={20} color={weather.severe ? colors.warm : colors.textMuted} />
            <Text style={[s.temp, weather.severe && { color: colors.warm }]}>{weather.temp}°</Text>
          </View>
        )}
      </View>

      <View style={s.clockRow}>
        <Text style={s.clock}>{clock}</Text>
        <Text style={s.ampm}>{ampm}</Text>
      </View>

      <View style={s.placeRow}>
        <Ionicons name="location-outline" size={15} color={colors.textMuted} />
        <Text style={s.place} numberOfLines={1}>{place}</Text>
        {weather?.severe && <Text style={s.severe}> · {weather.label}</Text>}
      </View>

      <View style={s.divider} />

      <View style={s.statusRow}>
        <View style={[s.dotHalo, { backgroundColor: status.dot + "33" }]}>
          <View style={[s.dot, { backgroundColor: status.dot }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.status}>{status.label}</Text>
          <Text style={s.lastMessaged}>{lastMessagedLabel(member.lastMessagedAt, now)}</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { members, loading } = useMembers();
  const { user } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Track the open person by id and read them from the live list, so their
  // detail sheet reflects label/location/photo changes while it's open.
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const people = members.filter((m) => !removedIds.has(m.id));
  const viewing = people.find((m) => m.id === viewingId) ?? null;

  useEffect(() => {
    // Clocks only show minutes, so a 10-second tick is plenty.
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    return watchUserProfile(user.uid, setProfile);
  }, [user?.uid]);

  useEffect(() => {
    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    members.forEach((m) => {
      if (m.birthday && m.birthday.slice(5) === todayMD) notifyBirthday(m, "birthday");
      if (m.anniversary && m.anniversary.slice(5) === todayMD) notifyBirthday(m, "anniversary");
      (m.importantDates || []).forEach((d) => {
        if (d.date && d.date.slice(5) === todayMD) notifyBirthday({ ...m, name: m.name + " — " + d.label } as any, "birthday");
      });
    });
  }, [members]);

  const firstName = profile?.name?.trim().split(/\s+/)[0];
  const dateLine = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now).toUpperCase();

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={type.eyebrow}>{dateLine}</Text>
        <Text style={[type.display, s.greeting]}>
          {greeting(now)}{firstName ? `, ${firstName}` : ""}.
        </Text>
        <Text style={[type.subtitle, s.subtitle]}>Everyone is better in stereo.</Text>

        <View style={s.sectionHeader}>
          <Text style={type.sectionTitle}>Your people</Text>
          {people.length > 0 && <Text style={type.caption}>{people.length}</Text>}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : people.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={40} color={colors.textFaint} />
            <Text style={s.emptyTitle}>No one here yet</Text>
            <Text style={[type.caption, { textAlign: "center" }]}>
              Invite family back home to see their local time, weather and whether it's a good moment to call.
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/connections")} activeOpacity={0.85}>
              <Text style={s.emptyBtnText}>Invite someone</Text>
            </TouchableOpacity>
          </View>
        ) : (
          people.map((m) => <PersonCard key={m.id} member={m} now={now} onPress={() => setViewingId(m.id)} />)
        )}
      </ScrollView>

      {viewing && (
        <PersonDetail
          member={viewing}
          visible
          onClose={() => setViewingId(null)}
          onDelete={(id) => {
            setRemovedIds((prev) => new Set(prev).add(id));
            setViewingId(null);
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 120 },
  greeting: { marginTop: 8 },
  subtitle: { marginTop: 10, maxWidth: 320 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 32, marginBottom: 14 },
  card: { borderRadius: radius.lg, padding: 22, marginBottom: space.lg },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  relationship: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  weather: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 4 },
  temp: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.text },
  clockRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 18 },
  clock: { fontFamily: fonts.serif, fontSize: 52, letterSpacing: -1.5, color: colors.text, lineHeight: 58 },
  ampm: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  place: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  severe: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.warm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 }, // dot sits beside the two-line status
  dotHalo: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.text },
  lastMessaged: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.text },
  emptyBtn: { marginTop: 8, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 12 },
  emptyBtnText: { fontFamily: fonts.sansSemiBold, color: colors.onPrimary, fontSize: 15 },
});
