import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { announceLiveLocationSetting } from "../lib/liveLocation";
import { colors, fonts } from "../theme";
type Settings = {
  notificationsEnabled: boolean;
  shareLiveLocation: boolean;
  accentColor: string;
  quietStart: number;
  quietEnd: number;
  userName: string;
  analyticsEnabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  shareLiveLocation: true,
  accentColor: colors.primary,
  quietStart: 22,
  quietEnd: 7,
  userName: "",
  analyticsEnabled: false,
};

function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("instereo_settings").then((raw: string | null) => {
      if (raw) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch {
          // ignore parse errors
        }
      }
      setLoaded(true);
    });
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    AsyncStorage.setItem("instereo_settings", JSON.stringify(next));
  };

  return { settings, update, loaded };
}

function formatHour(h: number) {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}


export default function SettingsScreen() {
  const router = useRouter();
  const { settings, update, loaded } = useSettings();

  const [notifModal, setNotifModal] = useState(false);
  const [quietModal, setQuietModal] = useState(false);
  const [privacyModal, setPrivacyModal] = useState(false);

  const [quietStartInput, setQuietStartInput] = useState(String(settings.quietStart));
  const [quietEndInput, setQuietEndInput] = useState(String(settings.quietEnd));

  useEffect(() => {
    if (loaded) {
      setQuietStartInput(String(settings.quietStart));
      setQuietEndInput(String(settings.quietEnd));
    }
  }, [loaded]);

  // Alert.alert() (including its button-callback form used for confirmation
  // dialogs) is a silent no-op on react-native-web, so "Sign out" would just
  // do nothing when clicked there — use a real in-app modal instead.
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  async function confirmSignOut() {
    setShowSignOutConfirm(false);
    const { auth } = await import("../config/firebase");
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
  }

  const accent = colors.primary;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Settings",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.sansBold, fontSize: 18 },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginLeft: 16 }}
            >
              <Ionicons name="chevron-back" size={24} color={accent} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={16} color={accent} />
          <Text style={[styles.backText, { color: accent }]}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => setNotifModal(true)}>
            <Ionicons name="notifications-outline" size={20} color={accent} />
            <Text style={styles.rowLabel}>Notifications</Text>
            <Text style={styles.rowSub}>
              {settings.notificationsEnabled ? "On" : "Off"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>

          <View style={styles.row}>
            <Ionicons name="navigate-outline" size={20} color={accent} />
            <Text style={styles.rowLabel}>Update my city automatically</Text>
            <Switch
              value={settings.shareLiveLocation}
              onValueChange={(on) => {
                update({ shareLiveLocation: on });
                announceLiveLocationSetting(on);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.onPrimary}
            />
          </View>

          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setQuietModal(true)}>
            <Ionicons name="time-outline" size={20} color={accent} />
            <Text style={styles.rowLabel}>Quiet hours</Text>
            <Text style={styles.rowSub}>
              {formatHour(settings.quietStart)} – {formatHour(settings.quietEnd)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/profile')}>
            <Ionicons name="person-outline" size={20} color={accent} />
            <Text style={styles.rowLabel}>Profile</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => router.push('/about')}>
            <Ionicons name="information-circle-outline" size={20} color={accent} />
            <Text style={styles.rowLabel}>About inStereo</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => setPrivacyModal(true)}>
            <Ionicons name="lock-closed-outline" size={20} color={accent} />
            <Text style={styles.rowLabel}>Privacy</Text>
            <Text style={styles.rowSub}>
              {settings.analyticsEnabled ? "Sharing" : "Private"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setShowSignOutConfirm(true)}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowLabel, { color: colors.danger }]}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>inStereo · v0.1</Text>
      </ScrollView>

      {/* Notifications Modal */}
      <Modal visible={notifModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Notifications</Text>
            <TouchableOpacity onPress={() => setNotifModal(false)}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalRow}>
            <Text style={styles.modalRowLabel}>Enable notifications</Text>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(v) => update({ notificationsEnabled: v })}
              trackColor={{ false: colors.border, true: accent }}
              thumbColor={colors.text}
            />
          </View>
          <Text style={styles.modalHint}>
            Receive alerts when a family member is in severe weather or a crisis event is detected.
          </Text>
          <TouchableOpacity
            style={[styles.modalDoneBtn, { backgroundColor: accent }]}
            onPress={() => setNotifModal(false)}
          >
            <Text style={styles.modalDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Quiet Hours Modal */}
      <Modal visible={quietModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Quiet Hours</Text>
            <TouchableOpacity onPress={() => setQuietModal(false)}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalHint}>Enter hours in 24-hour format (0–23).</Text>
          <Text style={styles.modalSectionLabel}>START HOUR</Text>
          <TextInput
            style={styles.modalInput}
            value={quietStartInput}
            onChangeText={setQuietStartInput}
            keyboardType="number-pad"
            maxLength={2}
            placeholderTextColor={colors.textFaint}
            placeholder="22"
          />
          <Text style={styles.modalSectionLabel}>END HOUR</Text>
          <TextInput
            style={styles.modalInput}
            value={quietEndInput}
            onChangeText={setQuietEndInput}
            keyboardType="number-pad"
            maxLength={2}
            placeholderTextColor={colors.textFaint}
            placeholder="7"
          />
          <TouchableOpacity
            style={[styles.modalDoneBtn, { backgroundColor: accent }]}
            onPress={() => {
              const s = parseInt(quietStartInput, 10);
              const e = parseInt(quietEndInput, 10);
              if (!isNaN(s) && s >= 0 && s <= 23) update({ quietStart: s });
              if (!isNaN(e) && e >= 0 && e <= 23) update({ quietEnd: e });
              setQuietModal(false);
            }}
          >
            <Text style={styles.modalDoneText}>Save</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Privacy Modal */}
      <Modal visible={privacyModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Privacy</Text>
            <TouchableOpacity onPress={() => setPrivacyModal(false)}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalRow}>
            <Text style={styles.modalRowLabel}>Share anonymous usage data</Text>
            <Switch
              value={settings.analyticsEnabled}
              onValueChange={(v) => update({ analyticsEnabled: v })}
              trackColor={{ false: colors.border, true: accent }}
              thumbColor={colors.text}
            />
          </View>
          <Text style={styles.modalHint}>
            Helps us improve inStereo. No personal data is ever shared.
          </Text>
          <TouchableOpacity
            style={[styles.modalDoneBtn, { backgroundColor: accent }]}
            onPress={() => setPrivacyModal(false)}
          >
            <Text style={styles.modalDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Sign out confirmation */}
      <Modal visible={showSignOutConfirm} transparent animationType="fade" onRequestClose={() => setShowSignOutConfirm(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Sign out</Text>
            <Text style={styles.confirmMessage}>Are you sure you want to sign out?</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setShowSignOutConfirm(false)}>
                <Text style={styles.confirmCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmSignOutBtn} onPress={confirmSignOut}>
                <Text style={styles.confirmSignOutTxt}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 100 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  backText: {
    fontSize: 15,
    fontFamily: fonts.sansSemiBold,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.sansSemiBold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.sansMedium,
  },
  rowSub: {
    fontFamily: fonts.sans, fontSize: 13,
    color: colors.textMuted,
    marginRight: 4,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 4,
  },
  footer: {
    textAlign: "center",
    color: colors.textFaint,
    fontFamily: fonts.sans, fontSize: 12,
    marginTop: 32,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: fonts.sansBold,
    color: colors.text,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontFamily: fonts.sansBold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  modalRowLabel: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.sansMedium,
    flex: 1,
    marginRight: 12,
  },
  modalHint: {
    fontFamily: fonts.sans, fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: 24,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 15,
    padding: 13,
    marginBottom: 16,
  },
  modalDoneBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  modalDoneText: {
    color: colors.onPrimary,
    fontFamily: fonts.sansBold,
    fontSize: 16,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.sansMedium,
  },
  confirmBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  confirmCard: {
    width: "100%", maxWidth: 360, backgroundColor: colors.surface, borderRadius: 20,
    padding: 22, borderWidth: 1, borderColor: colors.border,
  },
  confirmTitle: { color: colors.text, fontSize: 17, fontFamily: fonts.sansBold, marginBottom: 6 },
  confirmMessage: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 14, marginBottom: 20 },
  confirmActions: { flexDirection: "row", gap: 12 },
  confirmCancelBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: 12, backgroundColor: colors.surface,
  },
  confirmCancelTxt: { color: colors.text, fontSize: 14, fontFamily: fonts.sansSemiBold },
  confirmSignOutBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: 12, backgroundColor: colors.danger,
  },
  confirmSignOutTxt: { color: colors.text, fontSize: 14, fontFamily: fonts.sansBold },
});
