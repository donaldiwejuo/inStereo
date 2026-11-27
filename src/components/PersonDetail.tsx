import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, createAudioPlayer, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { confirmAction } from '../lib/confirm';
import { Member } from '../context/MembersContext';
import { ChatMessage, chatIdFor, deleteMessage, editMessage, labelConnection, markMessaged, sendMessage, setConnectionNickname, setConnectionPhoto, watchMessages } from '../lib/firestore';
import { getSafetyFeed, SafetyItem, Severity } from '../lib/safety';
import { uploadMedia } from '../lib/media';
import { colors, fonts, radius, tintFor } from '../theme';
import { currentWeekDays, WeekBars } from './pulse';
import { Avatar } from './ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  member: Member;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
};

type CalEvent = {
  id: string;
  title: string;
  date: string;      // "YYYY-MM-DD"
  startTime: string; // "HH:MM" 24h
  endTime: string;   // "HH:MM" 24h
  color: string;
  notes?: string;
  source?: string;
};

type CalVisibility = 'full' | 'availability' | 'hidden';

// ─── Constants ────────────────────────────────────────────────────────────────

const RELATIONSHIPS = [
  'Mother',
  'Father',
  'Grandmother',
  'Grandfather',
  'Sibling',
  'Partner',
  'Friend',
  'Aunt',
  'Uncle',
  'Cousin',
  'Other',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ─── NEWS TAB ─────────────────────────────────────────────────────────────────

function newsBorderColor(severity: Severity) {
  return severity === 'urgent' ? colors.danger : colors.warm;
}

function NewsTab({ member }: { member: Member }) {
  const [items, setItems] = useState<SafetyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);
    const load = () =>
      getSafetyFeed(member)
        .then((feed) => { if (!cancelled) setItems(feed); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    load();
    // Sources update every few minutes at most; refreshing faster just burns battery.
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [member.id, member.city, member.lat, member.lon]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={d.newsAgo}>
        Safety alerts and local news near {member.city || 'them'} from the last 3 days.
      </Text>
      {items.length === 0 && (
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40, fontFamily: fonts.sans, fontSize: 14 }}>
          Nothing concerning near {member.city || 'them'} right now ✓
        </Text>
      )}
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[d.newsCard, { borderLeftColor: newsBorderColor(item.severity), borderLeftWidth: 4 }]}
          activeOpacity={0.75}
          onPress={() => Linking.openURL(item.url)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: newsBorderColor(item.severity) }} />
            <Text style={{ fontSize: 9, fontFamily: fonts.sansBold, letterSpacing: 1, color: newsBorderColor(item.severity), textTransform: 'uppercase' }}>
              {item.severity === 'urgent' ? 'URGENT' : 'HEADS UP'} · {item.category}{item.kind === 'alert' ? ' · OFFICIAL ALERT' : ''}
            </Text>
          </View>
          <Text style={d.newsTitle}>{item.title}</Text>
          <Text style={d.newsAgo}>
            {item.source}{item.extraSources > 0 ? ` +${item.extraSources} more` : ''} · {timeAgo(item.publishedAt)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ZoomVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.play(); });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', aspectRatio: 16 / 9 }}
      contentFit="contain"
      nativeControls
    />
  );
}

// ─── CHAT TAB ─────────────────────────────────────────────────────────────────

export function ChatTab({ member, bottomInset = 0 }: { member: Member; bottomInset?: number }) {
  const { user } = useAuth();
  const chatId = user ? chatIdFor(user.uid, member.uid) : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomVideo, setZoomVideo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [uploading, setUploading] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKbHeight(e.endCoordinates.height);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    const unsub = watchMessages(chatId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    });
    return unsub;
  }, [chatId]);

  // Stops a recording or voice note if the chat closes mid-way.
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  useEffect(() => () => {
    try {
      playerRef.current?.remove();
      if (audioRecorder.isRecording) audioRecorder.stop().catch(() => {});
    } catch {
      // The recorder may already be released on unmount — nothing to stop.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deliver(data: { text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string }) {
    if (!user || !chatId) return;
    await sendMessage(chatId, user.uid, data);
    // "Last messaged" on Home — best effort, never blocks the message.
    markMessaged(member.connectionId, user.uid).catch(() => {});
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function sendText() {
    const body = text.trim();
    if (!body || !user || !chatId) return;
    setText('');
    try {
      await deliver({ text: body });
    } catch {
      setText(body); // give it back so nothing typed is lost
      Alert.alert('Not sent', 'Check your connection and try again.');
    }
  }

  async function uploadAndSend(uri: string, kind: 'image' | 'video' | 'audio', contentType?: string | null) {
    if (!chatId) return;
    setUploading(true);
    try {
      const url = await uploadMedia(uri, kind, { chatId, contentType });
      await deliver(kind === 'image' ? { imageUrl: url } : kind === 'video' ? { videoUrl: url } : { audioUrl: url });
    } catch (err) {
      const what = kind === 'audio' ? 'voice message' : kind;
      Alert.alert(`Could not send ${what}`, err instanceof Error ? err.message : 'Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function pickMedia(kind: 'image' | 'video') {
    if (!user || !chatId || uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'image' ? ['images'] : ['videos'],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets.length) return;
    const asset = result.assets[0];
    // The picker re-encodes photos as JPEG; videos keep their own type (.mov on iPhone).
    const contentType = kind === 'image' ? 'image/jpeg' : asset.mimeType ?? 'video/quicktime';
    await uploadAndSend(asset.uri, kind, contentType);
  }

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone is off', 'Allow microphone access for inStereo in Settings to send voice messages.');
        return;
      }
      playerRef.current?.remove();
      playerRef.current = null;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert('Could not start recording');
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      Alert.alert('Could not finish recording');
      return;
    }
    const uri = audioRecorder.uri;
    if (uri) await uploadAndSend(uri, 'audio', 'audio/mp4');
  }

  function longPressMessage(item: ChatMessage) {
    if (!chatId || item.senderId !== user?.uid) return;
    const opts: any[] = [];
    if (item.text) opts.push({ text: 'Edit', onPress: () => { setEditingId(item.id); setEditText(item.text); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150); } });
    opts.push({ text: 'Delete', style: 'destructive', onPress: () => deleteMessage(chatId, item.id) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', undefined, opts);
  }

  function saveEdit() {
    if (!editText.trim() || !chatId || !editingId) return;
    editMessage(chatId, editingId, editText.trim()).catch(() => Alert.alert('Could not save the edit'));
    setEditingId(null);
    setEditText('');
  }

  async function playAudio(url: string) {
    try {
      // One voice note at a time: stop whatever was playing first.
      playerRef.current?.remove();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = createAudioPlayer(url);
      playerRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          player.remove();
          if (playerRef.current === player) playerRef.current = null;
        }
      });
      player.play();
    } catch {
      Alert.alert('Could not play voice message');
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isEditing = editingId === item.id;
    const sent = item.senderId === user?.uid;
    return (
      <TouchableOpacity
        style={[d.bubble, sent ? d.bubbleSent : d.bubbleReceived]}
        onLongPress={() => longPressMessage(item)}
        activeOpacity={0.85}
        delayLongPress={400}
      >
        {item.imageUrl ? (
          <TouchableOpacity onPress={() => setZoomImage(item.imageUrl!)}>
            <Image source={{ uri: item.imageUrl }} style={{ width: 200, height: 200, borderRadius: 12 }} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}
        {item.videoUrl ? (
          <TouchableOpacity onPress={() => setZoomVideo(item.videoUrl!)} style={{ width: 200, height: 140, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Ionicons name="play-circle" size={48} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 11, marginTop: 4 }}>Tap to play</Text>
          </TouchableOpacity>
        ) : null}
        {item.audioUrl ? (
          <TouchableOpacity onPress={() => playAudio(item.audioUrl!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Ionicons name="play-circle" size={28} color={sent ? colors.onPrimary : colors.primary} />
            <Text style={{ color: sent ? colors.onPrimary : colors.primary, fontSize: 13, fontFamily: fonts.sansSemiBold }}>Voice message</Text>
          </TouchableOpacity>
        ) : null}
        {isEditing ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TextInput style={{ flex: 1, color: colors.text, fontFamily: fonts.sans, fontSize: 14, borderBottomWidth: 1, borderBottomColor: colors.primary }} value={editText} onChangeText={setEditText} autoFocus />
            <TouchableOpacity onPress={saveEdit}><Ionicons name="checkmark" size={18} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingId(null)}><Ionicons name="close" size={18} color={colors.textMuted} /></TouchableOpacity>
          </View>
        ) : item.text ? (
          <Text style={[d.bubbleText, sent ? d.bubbleTextSent : d.bubbleTextReceived]}>{item.text}</Text>
        ) : null}
        <Text style={[d.bubbleTime, sent && { color: 'rgba(255,255,255,0.7)' }]}>{item.timestamp?.toDate ? timeAgo(item.timestamp.toDate().toISOString()) : ''}{item.editedAt ? ' · edited' : ''}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flex: 1, paddingBottom: kbHeight }}>
      <FlatList style={{ flex: 1 }} ref={listRef} data={messages} keyExtractor={(item) => item.id} renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 16 }} showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={{ color: colors.textFaint, textAlign: 'center', marginTop: 60, fontFamily: fonts.sans, fontSize: 14 }}>No messages yet</Text>}
      />
      <View style={[d.inputRow, { paddingBottom: 12 + (kbHeight ? 0 : bottomInset) }]}>
        <TouchableOpacity onPress={() => pickMedia('image')} style={d.iconBtn} disabled={uploading || isRecording}>
          {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="camera-outline" size={22} color={colors.primary} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => pickMedia('video')} style={d.iconBtn} disabled={uploading || isRecording}>
          <Ionicons name="videocam-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={isRecording ? stopRecording : startRecording} style={[d.iconBtn, isRecording && { backgroundColor: "#F3E3E0" }]} disabled={uploading}>
          <Ionicons name={isRecording ? "stop-circle" : "mic-outline"} size={22} color={isRecording ? colors.danger : colors.primary} />
        </TouchableOpacity>
        <TextInput style={d.chatInput} value={text} onChangeText={setText} placeholder={isRecording ? 'Recording… tap ■ to send' : uploading ? 'Sending…' : `Message ${member.name}`} placeholderTextColor={colors.textFaint} returnKeyType="send" onSubmitEditing={sendText} multiline={false} />
        <TouchableOpacity onPress={sendText} style={d.sendBtn}>
          <Ionicons name="send" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>
      <Modal visible={!!zoomImage} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setZoomImage(null)}>
          {zoomImage ? <Image source={{ uri: zoomImage }} style={{ width: '90%', height: '70%', borderRadius: 16 }} resizeMode="contain" /> : null}
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!zoomVideo} transparent animationType="fade" onRequestClose={() => setZoomVideo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          {zoomVideo ? <ZoomVideoPlayer uri={zoomVideo} /> : null}
          <TouchableOpacity onPress={() => setZoomVideo(null)} style={{ position: 'absolute', top: 56, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={22} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ─── PULSE TAB ────────────────────────────────────────────────────────────────

function PulseTab({ member }: { member: Member }) {
  const days = currentWeekDays();
  const memberScores: Record<string, number> = member.pulseScores || {};
  const notes = member.weeklyNote || '';

  const logged = days.filter((day) => memberScores[day] !== undefined);
  const avg =
    logged.length > 0
      ? (logged.reduce((sum, day) => sum + memberScores[day], 0) / logged.length).toFixed(1)
      : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={d.pulseHeader}>{member.name}'s week</Text>

      <View style={d.card}>
        <WeekBars scores={memberScores} height={70} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <View style={d.chip}>
            <Text style={d.chipText}>Weekly avg: {avg ?? '—'}</Text>
          </View>
          <View style={d.chip}>
            <Text style={d.chipText}>Days logged: {logged.length} / 7</Text>
          </View>
        </View>
      </View>

      <View style={d.card}>
        <Text style={d.sectionLabel}>Notes from {member.name}</Text>
        {notes ? (
          <Text style={{ color: colors.text, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 }}>{notes}</Text>
        ) : (
          <Text style={{ color: colors.textFaint, fontFamily: fonts.sans, fontSize: 14, fontStyle: 'italic' }}>
            No notes left this week
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ─── EDIT SUB-MODAL ───────────────────────────────────────────────────────────

// Only your contact name and label for them are yours to change — everything
// else about a person (photo, city, dates) comes from their own profile and
// updates here live when they change it.
function EditModal({
  member,
  visible,
  onClose,
}: {
  member: Member;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  // Blank means "no contact name": they're shown by their own profile name.
  const initialNickname = member.name !== member.profileName ? member.name : '';
  const [nickname, setNickname] = useState(initialNickname);
  const [label, setLabel] = useState(member.relationship);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Your own photo for them — applied right away, separate from Save.
  async function changePhoto() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    setPhotoBusy(true);
    try {
      const url = await uploadMedia(result.assets[0].uri, 'photo', { contentType: 'image/jpeg' });
      await setConnectionPhoto(member.connectionId, user.uid, url);
    } catch (err) {
      Alert.alert('Could not change photo', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function resetPhoto() {
    if (!user) return;
    setPhotoBusy(true);
    try {
      await setConnectionPhoto(member.connectionId, user.uid, '');
    } catch {
      Alert.alert('Could not reset photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    setNickname(initialNickname);
    setLabel(member.relationship);
  }, [member.id, visible]);

  async function handleSave() {
    const trimmed = label.trim();
    if (!trimmed) {
      Alert.alert('Add a relationship', 'How are they related to you? e.g. Sister, Mom, Best friend.');
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      await Promise.all([
        labelConnection(member.connectionId, user.uid, trimmed),
        setConnectionNickname(member.connectionId, user.uid, nickname),
      ]);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={e.title}>Edit {member.name}</Text>

          <Text style={e.label}>PHOTO</Text>
          <View style={e.photoRow}>
            <Avatar person={member} size={72} />
            <View style={{ flex: 1, gap: 8 }}>
              <TouchableOpacity style={e.photoBtn} onPress={changePhoto} disabled={photoBusy}>
                {photoBusy
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={e.photoBtnTxt}>Choose a photo</Text>}
              </TouchableOpacity>
              {member.hasCustomPhoto && !photoBusy && (
                <TouchableOpacity onPress={resetPhoto}>
                  <Text style={e.photoReset}>Use the photo they set</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={e.label}>NAME</Text>
          <TextInput
            style={e.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder={member.profileName || 'Name'}
            placeholderTextColor={colors.textFaint}
            returnKeyType="next"
          />

          <Text style={e.label}>RELATIONSHIP</Text>
          <TextInput
            style={e.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Sister, Mom, Best friend"
            placeholderTextColor={colors.textFaint}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {RELATIONSHIPS.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setLabel(r)}
                style={[e.relBtn, label === r && e.relBtnActive]}
              >
                <Text style={[e.relText, label === r && e.relTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={e.citySelected}>
            Only you see this photo, name and relationship.{member.profileName ? ` Leave the name blank to use the one they set ("${member.profileName}").` : ''} Their photo, city and dates come from their own profile and update here automatically when they change them.
          </Text>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <TouchableOpacity style={e.cancelBtn} onPress={onClose}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.sansSemiBold }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[e.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold }}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── SCHEDULE TAB ────────────────────────────────────────────────────────────

function ScheduleTab({ member }: { member: Member }) {
  const visibility: CalVisibility = member.calendarVisibility ?? 'full';

  const events = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return (member.calendarEvents ?? [])
      .filter((e) => e.date >= today && e.date <= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [member.calendarEvents]);

  if (visibility === 'hidden') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.textFaint} />
        <Text style={{ color: colors.textMuted, fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' }}>
          Schedule is set to private.
        </Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
        <Ionicons name="calendar-outline" size={48} color={colors.textFaint} />
        <Text style={{ color: colors.textMuted, fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' }}>
          No upcoming events in the next 30 days.
        </Text>
      </View>
    );
  }

  const grouped: Record<string, CalEvent[]> = {};
  events.forEach((e) => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });
  const dates = Object.keys(grouped).sort();

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {visibility === 'availability' && (
        <View style={{ backgroundColor: "#E3E8E3", borderRadius: 10, padding: 10, marginBottom: 4 }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, textAlign: 'center' }}>
            Showing availability only — event details are private
          </Text>
        </View>
      )}
      {dates.map((date) => {
        const d = new Date(date + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        return (
          <View key={date}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontFamily: fonts.sansBold,
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              {label.toUpperCase()}
            </Text>
            {grouped[date].map((ev) => (
              <View
                key={ev.id}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 8,
                  borderLeftWidth: 3,
                  borderLeftColor: visibility === 'availability' ? colors.border : ev.color,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontFamily: fonts.sansBold }}>
                    {visibility === 'availability' ? 'Busy' : ev.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 3 }}>
                    {ev.startTime} – {ev.endTime}
                  </Text>
                  {visibility === 'full' && ev.notes ? (
                    <Text style={{ color: colors.textFaint, fontFamily: fonts.sans, fontSize: 12, marginTop: 4 }}>
                      {ev.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function PersonDetail({ member, visible, onClose, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<'News' | 'Chat' | 'Pulse' | 'Schedule'>('News');
  const [editVisible, setEditVisible] = useState(false);

  function confirmDelete() {
    confirmAction('Remove Person', `Remove ${member.name} from inStereo?`, 'Remove', () => {
      onClose();
      onDelete(member.id);
    });
  }

  const tabs: Array<'News' | 'Chat' | 'Pulse' | 'Schedule'> = ['News', 'Chat', 'Pulse', 'Schedule'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={d.root}>
        {/* Header */}
        <View style={[d.header, { backgroundColor: tintFor(member.id) }]}>
          <TouchableOpacity onPress={onClose} style={d.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={colors.primary} />
          </TouchableOpacity>

          <Avatar person={member} size={52} ring />

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={d.headerName} numberOfLines={1}>{member.name}</Text>
            <Text style={d.headerSub} numberOfLines={1}>
              {member.relationship} · {member.city}
            </Text>
          </View>

          <TouchableOpacity onPress={() => setEditVisible(true)} style={d.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="pencil-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDelete} style={[d.iconBtn, { marginLeft: 6 }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {/* Tab switcher */}
        <View style={d.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[d.tabItem, activeTab === tab && d.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[d.tabText, activeTab === tab && d.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'News' && <NewsTab member={member} />}
          {activeTab === 'Chat' && <ChatTab member={member} />}
          {activeTab === 'Pulse' && <PulseTab member={member} />}
          {activeTab === 'Schedule' && <ScheduleTab member={member} />}
        </View>

        {/* Edit modal */}
        <EditModal
          member={member}
          visible={editVisible}
          onClose={() => setEditVisible(false)}
        />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
  },
  backBtn: { marginRight: 8 },
  headerName: { fontSize: 26, fontFamily: fonts.serif, color: colors.text, letterSpacing: -0.5 },
  headerSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 14,
    fontFamily: fonts.sansMedium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
    fontFamily: fonts.sansSemiBold,
  },

  // News
  newsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  newsTitle: {
    fontSize: 14,
    fontFamily: fonts.sansBold,
    color: colors.text,
    lineHeight: 20,
  },
  newsAgo: {
    fontFamily: fonts.sans, fontSize: 11,
    color: colors.textFaint,
  },

  // Chat
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 2,
    gap: 4,
  },
  bubbleSent: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  bubbleReceived: {
    alignSelf: 'flex-start',
    backgroundColor: colors.onPrimary,
  },
  bubbleText: {
    fontFamily: fonts.sans, fontSize: 14,
    lineHeight: 19,
  },
  bubbleTextSent: { color: colors.onPrimary },
  bubbleTextReceived: { color: colors.text },
  bubbleTime: {
    fontFamily: fonts.sans, fontSize: 10,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pulse
  pulseHeader: { fontSize: 24, fontFamily: fonts.serif, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  chip: {
    backgroundColor: "#E3E8E3",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: fonts.sansSemiBold,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: fonts.sansBold,
    color: colors.text,
  },
  scoreBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  scoreBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scoreNum: {
    color: colors.textMuted,
    fontSize: 18,
    fontFamily: fonts.sansBold,
  },
  scoreNumActive: { color: colors.text },
  scoreDesc: {
    color: colors.textFaint,
    fontSize: 9,
    fontFamily: fonts.sansSemiBold,
    textAlign: 'center',
  },
  scoreDescActive: { color: colors.text },
  noteInput: {
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
});

// ─── Edit modal styles ────────────────────────────────────────────────────────

const e = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  photoBtn: {
    alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minWidth: 140, alignItems: 'center',
  },
  photoBtnTxt: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.text },
  photoReset: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
  title: { fontSize: 30, fontFamily: fonts.serif, color: colors.text, marginBottom: 24, letterSpacing: -0.5 },
  label: {
    fontSize: 11,
    fontFamily: fonts.sansBold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadBtn: {
    backgroundColor: "#E3E8E3",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  uploadText: { color: colors.primary, fontFamily: fonts.sansSemiBold, fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 15,
    padding: 13,
    marginBottom: 16,
  },
  dateBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 13,
    marginBottom: 16,
  },
  dateBtnText: { color: colors.text, fontFamily: fonts.sans, fontSize: 15 },
  relBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: colors.surface,
  },
  relBtnActive: {
    backgroundColor: "#E3E8E3",
    borderWidth: 1,
    borderColor: colors.accent,
  },
  relText: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.sansMedium },
  relTextActive: { color: colors.primary },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  resultsList: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultText: { color: colors.text, fontSize: 14, fontFamily: fonts.sansSemiBold },
  resultTz: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 11, marginTop: 2 },
  citySelected: {
    fontFamily: fonts.sans, fontSize: 12,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
});
