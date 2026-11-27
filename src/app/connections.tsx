import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/media";
import {
  Connection,
  createInvite,
  getConnectionsWithProfiles,
  getUserProfile,
  labelConnection,
  ProfileSnapshot,
  toProfileSnapshot,
} from "../lib/firestore";

import { colors, fonts } from "../theme";
const RELATIONSHIP_OPTIONS = [
  "Father", "Mother", "Son", "Daughter",
  "Brother", "Sister", "Grandfather", "Grandmother",
  "Grandchild", "Uncle", "Aunt", "Cousin", "Friend", "Partner",
];

function LabelPicker({
  connectionId,
  uid,
  name,
  onDone,
}: {
  connectionId: string;
  uid: string;
  name: string;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await labelConnection(connectionId, uid, selected);
      onDone();
    } catch {
      Alert.alert("Error", "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={lp.wrap}>
      <Text style={lp.prompt}>{name} is my…</Text>
      <View style={lp.grid}>
        {RELATIONSHIP_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[lp.chip, selected === opt && lp.chipActive]}
            onPress={() => setSelected(opt)}
          >
            <Text style={[lp.chipTxt, selected === opt && lp.chipTxtActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[lp.saveBtn, !selected && { opacity: 0.4 }]}
        onPress={save}
        disabled={!selected || saving}
      >
        {saving ? <ActivityIndicator color={colors.text} /> : <Text style={lp.saveTxt}>Save</Text>}
      </TouchableOpacity>
    </View>
  );
}

const lp = StyleSheet.create({
  wrap: {
    backgroundColor: "#E3E8E3",
    borderRadius: 16, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: colors.accent,
  },
  prompt: { color: colors.text, fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  chipTxtActive: { color: colors.onPrimary },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: "center",
  },
  saveTxt: { color: colors.onPrimary, fontSize: 14, fontFamily: fonts.sansBold },
});

type ConnWithProfile = { connection: Connection; profile: ProfileSnapshot };

export default function ConnectionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [connections, setConnections] = useState<ConnWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [labelingId, setLabelingId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getConnectionsWithProfiles(user.uid);
      setConnections(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [user?.uid]);

  // RN's Alert.alert() is a silent no-op on react-native-web, and window.alert()
  // is unreliable on mobile browsers once it fires after an `await` — Safari in
  // particular only honors alert()/clipboard calls made synchronously within
  // the user gesture, so by the time createInvite() resolves it can get
  // silently dropped. An in-app modal has no such timing requirement.
  function notify(title: string, message?: string) {
    if (Platform.OS === "web") {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  }

  async function handleInvite() {
    if (!user) return;
    setInviting(true);
    try {
      const profile = await getUserProfile(user.uid);
      if (!profile) { notify("Error", "Could not load your profile."); return; }
      const inviteId = await createInvite(user.uid, toProfileSnapshot(profile));
      // A normal https link opens anywhere (WhatsApp, iMessage, email) and its
      // page hands off to the app — instereo:// links only work if it's installed.
      const url = `${API_URL}/invite/${inviteId}`;
      if (Platform.OS === "web") {
        setCopied(false);
        setInviteUrl(url);
      } else {
        await Share.share({
          message: `Join me on inStereo! Tap this link to connect: ${url}`,
          url,
        });
      }
    } catch (err: any) {
      if (err?.message !== "The user did not share") {
        notify("Error", String(err?.message ?? err));
      }
    } finally {
      setInviting(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      // Clipboard API can refuse silently (insecure origin, permissions,
      // older Safari); the link is still shown as selectable text either way.
    }
  }

  const needsLabel = connections.filter(
    ({ connection }) =>
      connection.status === "pending_label" && !connection.labels?.[user!.uid]
  );
  const accepted = connections.filter(
    ({ connection }) => connection.status === "accepted"
  );
  const pendingTheirLabel = connections.filter(
    ({ connection }) =>
      connection.status === "pending_label" && !!connection.labels?.[user!.uid]
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Connections</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Invite button */}
        <TouchableOpacity style={s.inviteBtn} onPress={handleInvite} disabled={inviting} activeOpacity={0.8}>
          {inviting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <View style={s.inviteIcon}>
                <Ionicons name="person-add" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.inviteTxt}>Invite someone</Text>
                <Text style={s.inviteSub}>Share a link to connect</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </>
          )}
        </TouchableOpacity>

        {/* Needs your label */}
        {needsLabel.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Label your new connections</Text>
            {needsLabel.map(({ connection, profile }) => (
              <View key={connection.id} style={s.card}>
                <View style={s.cardTop}>
                  {profile.photoUrl ? (
                    <Image source={{ uri: profile.photoUrl }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarFallback]}>
                      <Text style={s.avatarInitial}>{profile.name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{profile.name}</Text>
                    <Text style={s.cardSub}>{profile.city}, {profile.country}</Text>
                  </View>
                  <View style={s.newBadge}><Text style={s.newBadgeTxt}>NEW</Text></View>
                </View>
                {labelingId === connection.id ? (
                  <LabelPicker
                    connectionId={connection.id}
                    uid={user!.uid}
                    name={profile.name.split(" ")[0]}
                    onDone={() => { setLabelingId(null); load(); }}
                  />
                ) : (
                  <TouchableOpacity
                    style={s.labelBtn}
                    onPress={() => setLabelingId(connection.id)}
                  >
                    <Text style={s.labelBtnTxt}>Who is this person to you?</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Waiting on their label */}
        {pendingTheirLabel.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Waiting for them to label you</Text>
            {pendingTheirLabel.map(({ connection, profile }) => (
              <View key={connection.id} style={[s.card, { opacity: 0.7 }]}>
                <View style={s.cardTop}>
                  {profile.photoUrl ? (
                    <Image source={{ uri: profile.photoUrl }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarFallback]}>
                      <Text style={s.avatarInitial}>{profile.name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{profile.name}</Text>
                    <Text style={s.cardSub}>You labeled them: {connection.labels?.[user!.uid]}</Text>
                  </View>
                  <ActivityIndicator color={colors.primary} size="small" />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Accepted connections */}
        {accepted.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Your connections</Text>
            {accepted.map(({ connection, profile }) => {
              const myLabel = connection.labels?.[user!.uid] ?? "Connection";
              const theirLabel = connection.labels?.[profile.uid] ?? "";
              return (
                <View key={connection.id} style={s.card}>
                  <View style={s.cardTop}>
                    {profile.photoUrl ? (
                      <Image source={{ uri: profile.photoUrl }} style={s.avatar} />
                    ) : (
                      <View style={[s.avatar, s.avatarFallback]}>
                        <Text style={s.avatarInitial}>{profile.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{profile.name}</Text>
                      <Text style={s.cardSub}>
                        Your {myLabel} · {profile.city}
                      </Text>
                    </View>
                    <View style={s.connectedBadge}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!loading && connections.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={52} color={colors.textFaint} />
            <Text style={s.emptyTxt}>No connections yet</Text>
            <Text style={s.emptySub}>Tap "Invite someone" to send your first invite link.</Text>
          </View>
        )}

        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </ScrollView>

      <Modal visible={!!inviteUrl} transparent animationType="fade" onRequestClose={() => setInviteUrl(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Invite link ready</Text>
            <Text style={s.modalSub}>Send this to whoever you want to connect with.</Text>
            <TextInput
              style={s.modalUrlInput}
              value={inviteUrl ?? ""}
              editable={false}
              selectTextOnFocus
              multiline
            />
            <TouchableOpacity style={s.modalCopyBtn} onPress={copyInviteUrl} activeOpacity={0.8}>
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={colors.onPrimary} />
              <Text style={s.modalCopyBtnTxt}>{copied ? "Copied!" : "Copy link"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalDoneBtn} onPress={() => setInviteUrl(null)}>
              <Text style={s.modalDoneBtnTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  title: { color: colors.text, fontSize: 17, fontFamily: fonts.sansBold },
  content: { padding: 16, gap: 8, paddingBottom: 60 },
  inviteBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#E3E8E3",
    borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: colors.accent,
    marginBottom: 8,
  },
  inviteIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#E3E8E3",
    alignItems: "center", justifyContent: "center",
  },
  inviteTxt: { color: colors.text, fontSize: 15, fontFamily: fonts.sansBold },
  inviteSub: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  section: { gap: 10, marginTop: 8 },
  sectionLabel: {
    color: colors.textMuted, fontSize: 11, fontFamily: fonts.sansBold,
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: "hidden" },
  avatarFallback: { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.text, fontSize: 20, fontFamily: fonts.sansBold },
  cardName: { color: colors.text, fontSize: 15, fontFamily: fonts.sansBold },
  cardSub: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  newBadge: {
    backgroundColor: "#E3E8E3", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.accent,
  },
  newBadgeTxt: { color: colors.primary, fontSize: 10, fontFamily: fonts.sansBold, letterSpacing: 0.5 },
  connectedBadge: { padding: 4 },
  labelBtn: {
    marginTop: 12, paddingVertical: 12,
    backgroundColor: "#E3E8E3",
    borderRadius: 12, alignItems: "center",
    borderWidth: 1, borderColor: colors.accent,
  },
  labelBtnTxt: { color: colors.primary, fontSize: 13, fontFamily: fonts.sansSemiBold },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTxt: { color: colors.textMuted, fontSize: 17, fontFamily: fonts.sansSemiBold },
  emptySub: { color: colors.textFaint, fontFamily: fonts.sans, fontSize: 13, textAlign: "center", lineHeight: 19 },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modalCard: {
    width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: 20,
    padding: 22, borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontFamily: fonts.sansBold },
  modalSub: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13, marginTop: -8 },
  modalUrlInput: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 12,
    color: colors.primary, fontFamily: fonts.sans, fontSize: 13, borderWidth: 1, borderColor: colors.border,
  },
  modalCopyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
  },
  modalCopyBtnTxt: { color: colors.onPrimary, fontSize: 14, fontFamily: fonts.sansBold },
  modalDoneBtn: { alignItems: "center", paddingVertical: 10 },
  modalDoneBtnTxt: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.sansSemiBold },
});
