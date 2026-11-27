import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMembers } from "../../context/MembersContext";
import { confirmAction } from "../../lib/confirm";

import { cardTints, colors, fonts } from "../../theme";
type Moment = {
  id: string;
  photoUri: string;
  caption: string;
  createdAt: string; // ISO
};

type MomentsMap = Record<string, Moment[]>;

const STORAGE_KEY = "instereo_moments";

const AVATAR_COLORS = cardTints;

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function MomentsScreen() {
  const { members } = useMembers();
  const [momentsMap, setMomentsMap] = useState<MomentsMap>({});
  const [loaded, setLoaded] = useState(false);

  // Add photo modal
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  // View photo modal
  const [viewMoment, setViewMoment] = useState<Moment | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setMomentsMap(JSON.parse(raw));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  async function saveMoments(newMap: MomentsMap) {
    setMomentsMap(newMap);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
  }

  async function handleAdd(memberId: number) {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPendingUri(result.assets[0].uri);
      setCaption("");
      setAddingFor(memberId);
    }
  }

  async function handleSave() {
    if (!pendingUri || addingFor === null) return;
    const key = addingFor.toString();
    const newMoment: Moment = {
      id: Date.now().toString(),
      photoUri: pendingUri,
      caption,
      createdAt: new Date().toISOString(),
    };
    const existing = momentsMap[key] || [];
    const newMap = { ...momentsMap, [key]: [newMoment, ...existing] };
    await saveMoments(newMap);
    setAddingFor(null);
    setPendingUri(null);
    setCaption("");
  }

  function handleLongPress(memberId: number, moment: Moment) {
    confirmAction("Delete this memory?", undefined, "Delete", async () => {
      const key = memberId.toString();
      const filtered = (momentsMap[key] || []).filter((m) => m.id !== moment.id);
      await saveMoments({ ...momentsMap, [key]: filtered });
    });
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {members.map((member) => {
          const moments = momentsMap[member.id.toString()] || [];
          const initial = member.name[0]?.toUpperCase() ?? "?";
          const avatarColor = getAvatarColor(member.id);

          return (
            <View key={member.id} style={s.section}>
              {/* Section header */}
              <View style={s.sectionHeader}>
                {member.photoUri ? (
                  <Image
                    source={{ uri: member.photoUri }}
                    style={s.avatar}
                  />
                ) : (
                  <View style={[s.avatar, { backgroundColor: avatarColor }]}>
                    <Text style={s.avatarInitial}>{initial}</Text>
                  </View>
                )}
                <View>
                  <Text style={s.memberName}>{member.name}</Text>
                  <Text style={s.memberRel}>{member.relationship}</Text>
                </View>
              </View>

              {/* Horizontal photo scroll */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.photoRow}
              >
                {moments.length === 0 && (
                  <View style={s.emptyInline}>
                    <Text style={s.emptyInlineText}>
                      No memories yet — tap + to add one
                    </Text>
                  </View>
                )}
                {moments.map((moment) => (
                  <TouchableOpacity
                    key={moment.id}
                    onPress={() => setViewMoment(moment)}
                    onLongPress={() => handleLongPress(member.id, moment)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: moment.photoUri }}
                      style={s.thumbnail}
                    />
                  </TouchableOpacity>
                ))}
                {/* Add button */}
                <TouchableOpacity
                  style={s.addBtn}
                  onPress={() => handleAdd(member.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={28} color={colors.primary} />
                </TouchableOpacity>
              </ScrollView>
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add photo modal */}
      <Modal
        visible={addingFor !== null && pendingUri !== null}
        animationType="slide"
        transparent
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {pendingUri && (
              <Image
                source={{ uri: pendingUri }}
                style={s.previewImage}
                resizeMode="cover"
              />
            )}
            <TextInput
              style={s.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption..."
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => {
                  setAddingFor(null);
                  setPendingUri(null);
                  setCaption("");
                }}
              >
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View photo modal */}
      <Modal
        visible={viewMoment !== null}
        animationType="fade"
        transparent
      >
        <View style={s.viewOverlay}>
          <TouchableOpacity
            style={s.closeBtn}
            onPress={() => setViewMoment(null)}
          >
            <Ionicons name="close" size={24} color={colors.onPrimary} />
          </TouchableOpacity>
          {viewMoment && (
            <>
              <Image
                source={{ uri: viewMoment.photoUri }}
                style={s.fullImage}
                resizeMode="contain"
              />
              {viewMoment.caption ? (
                <Text style={s.viewCaption}>{viewMoment.caption}</Text>
              ) : null}
              <Text style={s.viewDate}>{formatDate(viewMoment.createdAt)}</Text>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 100 },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInitial: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 18,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.sansBold,
  },
  memberRel: {
    color: colors.textMuted,
    fontFamily: fonts.sans, fontSize: 12,
    marginTop: 2,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 4,
    minHeight: 80,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  addBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E3E8E3",
  },
  emptyInline: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  emptyInlineText: {
    color: colors.textFaint,
    fontFamily: fonts.sans, fontSize: 13,
    fontStyle: "italic",
    maxWidth: 160,
    textAlign: "center",
  },
  // Add photo modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
  },
  captionInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 15,
    padding: 13,
    minHeight: 60,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  cancelText: {
    color: colors.textMuted,
    fontFamily: fonts.sansSemiBold,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  saveText: {
    color: colors.onPrimary,
    fontFamily: fonts.sansBold,
  },
  // View photo modal
  viewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: "100%",
    height: "65%",
    borderRadius: 16,
  },
  viewCaption: {
    color: colors.onPrimary,
    fontSize: 15,
    textAlign: "center",
    marginTop: 16,
    fontFamily: fonts.sansMedium,
  },
  viewDate: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: fonts.sans, fontSize: 12,
    marginTop: 8,
  },
});
