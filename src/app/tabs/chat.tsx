import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatTab } from "../../components/PersonDetail";
import { Avatar, ScreenHeading } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { Member, useMembers } from "../../context/MembersContext";
import { ChatMessage, chatIdFor, watchLastMessage } from "../../lib/firestore";
import { localClock, reachStatus } from "../../lib/presence";
import { colors, fonts, type } from "../../theme";

function previewText(m: ChatMessage, mine: boolean): string {
  const body = m.text || (m.imageUrl ? "Photo" : m.videoUrl ? "Video" : m.audioUrl ? "Voice message" : "");
  return (mine ? "You: " : "") + body;
}

function sentAt(m: ChatMessage): Date | null {
  return m.timestamp?.toDate ? m.timestamp.toDate() : null;
}

function shortTime(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Watches the newest message in every conversation, for the list previews.
function useLastMessages(myUid: string | undefined, members: Member[]) {
  const [last, setLast] = useState<Record<string, ChatMessage | null>>({});
  const key = members.map((m) => m.uid).join(",");
  useEffect(() => {
    if (!myUid) return;
    const unsubs = members.map((m) =>
      watchLastMessage(chatIdFor(myUid, m.uid), (msg) => setLast((prev) => ({ ...prev, [m.uid]: msg }))),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid, key]);
  return last;
}

function Thread({ member, onClose }: { member: Member; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const status = reachStatus(member, now);

  return (
    <View style={[t.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={t.header}>
        <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Back to messages">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Avatar person={member} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={t.name} numberOfLines={1}>{member.name}</Text>
          <View style={t.statusRow}>
            <View style={[t.dot, { backgroundColor: status.dot }]} />
            <Text style={type.caption} numberOfLines={1}>{status.label} · {localClock(member.timezone, now)}</Text>
          </View>
        </View>
      </View>
      <ChatTab member={member} bottomInset={insets.bottom} />
    </View>
  );
}

export default function ChatScreen() {
  const { user } = useAuth();
  const { members } = useMembers();
  const last = useLastMessages(user?.uid, members);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const open = members.find((m) => m.uid === openUid) ?? null;

  // Most recent conversation first; people you haven't messaged go last.
  const sorted = [...members].sort((a, b) => {
    const ta = last[a.uid] ? sentAt(last[a.uid]!)?.getTime() ?? 0 : 0;
    const tb = last[b.uid] ? sentAt(last[b.uid]!)?.getTime() ?? 0 : 0;
    return tb - ta;
  });

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <FlatList
        data={sorted}
        keyExtractor={(m) => m.uid}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={<ScreenHeading eyebrow="Messages" title="Stay in touch." />}
        ListEmptyComponent={
          <Text style={[type.caption, { paddingHorizontal: 22 }]}>
            When you connect with someone, your conversation with them shows up here.
          </Text>
        }
        renderItem={({ item: m }) => {
          const msg = last[m.uid];
          const when = msg ? sentAt(msg) : null;
          return (
            <TouchableOpacity style={s.row} onPress={() => setOpenUid(m.uid)} activeOpacity={0.7}>
              <Avatar person={m} size={52} />
              <View style={{ flex: 1 }}>
                <View style={s.rowTop}>
                  <Text style={s.name} numberOfLines={1}>{m.name}</Text>
                  {when && <Text style={s.time}>{shortTime(when)}</Text>}
                </View>
                <Text style={s.preview} numberOfLines={1}>
                  {msg ? previewText(msg, msg.senderId === user?.uid) : `Say hello to ${m.name}`}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpenUid(null)}>
        {open && <Thread member={open} onClose={() => setOpenUid(null)} />}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 22, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, flexShrink: 1 },
  time: { fontFamily: fonts.sans, fontSize: 12, color: colors.textFaint },
  preview: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, marginTop: 3 },
});

const t = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  name: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
