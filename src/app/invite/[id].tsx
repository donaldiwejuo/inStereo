import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { acceptInvite, getInvite, Invite } from "../../lib/firestore";

import { colors, fonts } from "../../theme";
const PENDING_INVITE_KEY = "pendingInviteId";

const RELATIONSHIP_OPTIONS = [
  { label: "Father", icon: "👨" },
  { label: "Mother", icon: "👩" },
  { label: "Son", icon: "👦" },
  { label: "Daughter", icon: "👧" },
  { label: "Brother", icon: "👱‍♂️" },
  { label: "Sister", icon: "👱‍♀️" },
  { label: "Grandfather", icon: "👴" },
  { label: "Grandmother", icon: "👵" },
  { label: "Grandchild", icon: "🧒" },
  { label: "Uncle", icon: "👨‍🦱" },
  { label: "Aunt", icon: "👩‍🦱" },
  { label: "Cousin", icon: "🧑" },
  { label: "Friend", icon: "🤝" },
  { label: "Partner", icon: "💑" },
];

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!id) { setError("Invalid invite link."); setInviteLoading(false); return; }
    getInvite(id).then((inv) => {
      if (!inv) { setError("This invite link is invalid or has expired."); }
      else if (inv.status === "used") { setError("This invite has already been used."); }
      else if (user && inv.creatorUid === user.uid) { setError("You can't connect with yourself!"); }
      else { setInvite(inv); }
      setInviteLoading(false);
    });
  }, [id, user?.uid]);

  async function handleAccept() {
    if (!selectedLabel) { Alert.alert("Select a relationship", "Choose how you know this person."); return; }
    if (!invite || !user) return;
    setAccepting(true);
    try {
      await acceptInvite(id as string, invite, user.uid, selectedLabel);
      router.replace("/tabs");
    } catch {
      Alert.alert("Error", "Could not accept the invite. Try again.");
    } finally {
      setAccepting(false);
    }
  }

  // Wait for auth to resolve before showing anything
  if (authLoading) {
    return <View style={s.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  // Not logged in — show sign-in prompt and save the invite ID
  if (!user) {
    return (
      <View style={s.center}>
        {inviteLoading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginBottom: 24 }} />
        ) : invite ? (
          <>
            <View style={s.avatarWrap}>
              {invite.creatorProfile.photoUrl ? (
                <Image source={{ uri: invite.creatorProfile.photoUrl }} style={s.avatar} />
              ) : (
                <View style={s.avatarFallback}>
                  <Text style={s.avatarInitial}>{invite.creatorProfile.name?.[0]?.toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Text style={s.title}>
              <Text style={s.name}>{invite.creatorProfile.name}</Text> wants to connect with you
            </Text>
            {(invite.creatorProfile.city || invite.creatorProfile.country) && (
              <View style={s.locationRow}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={s.locationTxt}>
                  {[invite.creatorProfile.city, invite.creatorProfile.country].filter(Boolean).join(", ")}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Ionicons name="people-outline" size={56} color={colors.textFaint} />
        )}
        <Text style={s.signInPrompt}>Sign in to accept this invite</Text>
        <TouchableOpacity
          style={s.btn}
          onPress={async () => {
            if (id) await AsyncStorage.setItem(PENDING_INVITE_KEY, id as string);
            router.replace("/(auth)/login");
          }}
        >
          <Text style={s.btnTxt}>Sign In / Create Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (inviteLoading) {
    return <View style={s.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="warning-outline" size={48} color={colors.textFaint} />
        <Text style={s.errorTxt}>{error}</Text>
        <TouchableOpacity style={s.btn} onPress={() => router.replace("/tabs")}>
          <Text style={s.btnTxt}>Go to app</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.header}>
        <View style={s.avatarWrap}>
          {invite?.creatorProfile.photoUrl ? (
            <Image source={{ uri: invite.creatorProfile.photoUrl }} style={s.avatar} />
          ) : (
            <View style={s.avatarFallback}>
              <Text style={s.avatarInitial}>{invite?.creatorProfile.name?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={s.linkBadge}>
            <Ionicons name="link" size={14} color={colors.primary} />
          </View>
        </View>
        <Text style={s.title}>
          <Text style={s.name}>{invite?.creatorProfile.name}</Text> wants to connect with you
        </Text>
        {(invite?.creatorProfile.city || invite?.creatorProfile.country) && (
          <View style={s.locationRow}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={s.locationTxt}>
              {[invite?.creatorProfile.city, invite?.creatorProfile.country].filter(Boolean).join(", ")}
            </Text>
          </View>
        )}
        <Text style={s.sub}>
          Once you connect, you'll both see each other's local time, weather, news, and more.
        </Text>
      </View>

      <Text style={s.sectionLabel}>They are my…</Text>
      <View style={s.grid}>
        {RELATIONSHIP_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.label}
            style={[s.option, selectedLabel === opt.label && s.optionActive]}
            onPress={() => setSelectedLabel(opt.label)}
            activeOpacity={0.75}
          >
            <Text style={s.optionIcon}>{opt.icon}</Text>
            <Text style={[s.optionTxt, selectedLabel === opt.label && s.optionTxtActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[s.btn, !selectedLabel && { opacity: 0.45 }, accepting && { opacity: 0.6 }]}
        onPress={handleAccept}
        disabled={!selectedLabel || accepting}
        activeOpacity={0.8}
      >
        {accepting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Ionicons name="people" size={18} color={colors.text} style={{ marginRight: 8 }} />
            <Text style={s.btnTxt}>Connect with {invite?.creatorProfile.name?.split(" ")[0]}</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={s.declineBtn} onPress={() => router.replace("/tabs")}>
        <Text style={s.declineTxt}>Decline</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingTop: 80, paddingBottom: 60 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  header: { alignItems: "center", marginBottom: 36 },
  avatarWrap: { position: "relative", marginBottom: 20 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { color: colors.text, fontSize: 36, fontFamily: fonts.sansBold },
  linkBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#E3E8E3",
    borderWidth: 2, borderColor: colors.background,
    alignItems: "center", justifyContent: "center",
  },
  title: { color: colors.text, fontSize: 22, fontFamily: fonts.sansBold, textAlign: "center", marginBottom: 10, lineHeight: 30 },
  name: { color: colors.primary },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 10 },
  locationTxt: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13 },
  sub: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 14, textAlign: "center", lineHeight: 21 },
  sectionLabel: {
    color: colors.textMuted, fontSize: 11, fontFamily: fonts.sansBold,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 32 },
  option: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: "#E3E8E3" },
  optionIcon: { fontFamily: fonts.sans, fontSize: 18 },
  optionTxt: { color: colors.text, fontSize: 14, fontFamily: fonts.sansSemiBold },
  optionTxtActive: { color: colors.text },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    marginBottom: 12, width: "100%",
  },
  btnTxt: { color: colors.onPrimary, fontSize: 16, fontFamily: fonts.sansBold },
  errorTxt: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 15, textAlign: "center", lineHeight: 22 },
  signInPrompt: { color: colors.textMuted, fontSize: 16, fontFamily: fonts.sansSemiBold, textAlign: "center" },
  declineBtn: { alignItems: "center", paddingVertical: 12 },
  declineTxt: { color: colors.textFaint, fontFamily: fonts.sans, fontSize: 14 },
});
