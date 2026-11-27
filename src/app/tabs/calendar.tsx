import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
// expo-calendar's default export now throws on every *Async method at
// runtime to force migration off the old API — expo-calendar/legacy still
// has the real, working implementations under the same names.
import * as Calendar from "expo-calendar/legacy";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { confirmAction, notifyMessage } from "../../lib/confirm";
import { SharedCalendarEvent, updateUserProfile } from "../../lib/firestore";

import { ScreenHeading } from "../../components/ui";
import { colors, fonts } from "../../theme";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalendarVisibility = "full" | "availability" | "hidden";

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM" 24h
  endTime: string; // "HH:MM" 24h
  color: string;
  notes?: string;
  source?: "device";
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "instereo_calendar";
const VISIBILITY_KEY = "instereo_calendar_visibility";

const EVENT_COLORS = [
  colors.primary,
  "#7D6E8F", // lavender
  colors.accent,
  "#5B7A8C", // blue-grey
  colors.warm,
  colors.danger,
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 23;
const HOUR_HEIGHT = 60;
const TIME_COL_WIDTH = 44;
const ACCENT = colors.primary;
const BG = colors.background;

const SCREEN_WIDTH = Dimensions.get("window").width;
const DAY_COL_WIDTH = (SCREEN_WIDTH - TIME_COL_WIDTH) / 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function timeToMinutes(t: string): number {
  const parts = t.split(":");
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatTime12(t: string): string {
  const parts = t.split(":");
  if (parts.length < 2) return t;
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

function isValidTime(t: string): boolean {
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function timeToY(hour: number, minute: number): number {
  return (hour - GRID_START_HOUR) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
}

function clampTime(h: number, m: number): { h: number; m: number } {
  if (h < GRID_START_HOUR) return { h: GRID_START_HOUR, m: 0 };
  if (h > GRID_END_HOUR) return { h: GRID_END_HOUR, m: 0 };
  return { h, m };
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers
// ---------------------------------------------------------------------------

async function loadEvents(): Promise<CalendarEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CalendarEvent[];
  } catch {
    return [];
  }
}

// Redact before it ever leaves the device — connections only ever see what
// this function decides to send them, never the raw event list.
function redactForSharing(events: CalendarEvent[], visibility: CalendarVisibility): SharedCalendarEvent[] {
  if (visibility === "hidden") return [];
  if (visibility === "availability") {
    return events.map((e) => ({
      id: e.id, title: "Busy", date: e.date, startTime: e.startTime, endTime: e.endTime, color: colors.textFaint,
    }));
  }
  return events.map((e) => ({
    id: e.id, title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, color: e.color, notes: e.notes,
  }));
}

async function saveEvents(events: CalendarEvent[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// ---------------------------------------------------------------------------
// Device calendar helpers
// ---------------------------------------------------------------------------

function parseEvDate(raw: Date | string | undefined): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw as string);
  return isNaN(d.getTime()) ? null : d;
}

// Extract "YYYY-MM-DD" from an all-day event's startDate without timezone
// conversion. All-day events use midnight UTC, which shifts to the previous
// day in US timezones when parsed with new Date() and local getters.
function allDayDateString(raw: Date | string | undefined): string | null {
  if (!raw) return null;
  if (typeof raw === "string" && raw.length >= 10) return raw.slice(0, 10);
  const d = raw instanceof Date ? raw : new Date(raw as string);
  if (isNaN(d.getTime())) return null;
  // Use UTC getters so midnight UTC stays on the correct calendar day
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapDeviceEvent(
  ev: Calendar.Event,
  calColor: string
): CalendarEvent | null {
  // All-day events: pin to 8–9 AM using the correct UTC date
  if (ev.allDay === true) {
    const dateStr = allDayDateString(ev.startDate);
    if (!dateStr) return null;
    return {
      id: `device-${ev.id}`,
      title: ev.title || "(no title)",
      date: dateStr,
      startTime: "08:00",
      endTime: "08:30",
      color: ACCENT,
      source: "device",
    };
  }

  const start = parseEvDate(ev.startDate);
  if (!start) return null;

  const end = parseEvDate(ev.endDate) ?? new Date(start.getTime() + 60 * 60 * 1000);

  const sh = start.getHours();
  const sm = start.getMinutes();

  // Skip events that start entirely outside the visible grid (past 11 PM)
  if (sh >= GRID_END_HOUR && sm >= 59) return null;

  // If an event ends on a different day (multi-day or past midnight), cap at grid end
  const endsNextDay = toDateString(end) !== toDateString(start);
  const eh = endsNextDay ? GRID_END_HOUR : end.getHours();
  const em = endsNextDay ? 0 : end.getMinutes();

  const sc = clampTime(sh, sm);
  const ec = clampTime(eh, em);

  const startTime = `${String(sc.h).padStart(2, "0")}:${String(sc.m).padStart(2, "0")}`;
  let endTime = `${String(ec.h).padStart(2, "0")}:${String(ec.m).padStart(2, "0")}`;

  if (endTime <= startTime) {
    endTime = `${String(Math.min(GRID_END_HOUR, sc.h + 1)).padStart(2, "0")}:${String(sc.m).padStart(2, "0")}`;
  }

  return {
    id: `device-${ev.id}`,
    title: ev.title || "(no title)",
    date: toDateString(start),
    startTime,
    endTime,
    color: ACCENT,
    notes: ev.notes ?? undefined,
    source: "device",
  };
}

// ---------------------------------------------------------------------------
// Time-picker row
// ---------------------------------------------------------------------------

function TimePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const parts = value.split(":");
  const h24 = parseInt(parts[0] ?? "8", 10) || 0;
  const m = parseInt(parts[1] ?? "0", 10) || 0;
  const isPM = h24 >= 12;
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;

  function update(newH12: number, newM: number, newIsPM: boolean) {
    let ch = newH12;
    if (ch < 1) ch = 12;
    if (ch > 12) ch = 1;
    let cm = newM;
    if (cm < 0) cm = 55;
    if (cm > 55) cm = 0;
    const h24out = newIsPM
      ? ch === 12
        ? 12
        : ch + 12
      : ch === 12
        ? 0
        : ch;
    onChange(
      `${String(h24out).padStart(2, "0")}:${String(cm).padStart(2, "0")}`
    );
  }

  const HIT = { top: 6, bottom: 6, left: 6, right: 6 };

  return (
    <View style={tp.row}>
      <Text style={tp.label}>{label}</Text>
      <View style={tp.controls}>
        <TouchableOpacity
          style={tp.btn}
          onPress={() => update(h12 - 1, m, isPM)}
          hitSlop={HIT}
        >
          <Ionicons name="remove" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={tp.val}>{String(h12).padStart(2, "0")}</Text>
        <TouchableOpacity
          style={tp.btn}
          onPress={() => update(h12 + 1, m, isPM)}
          hitSlop={HIT}
        >
          <Ionicons name="add" size={16} color={colors.text} />
        </TouchableOpacity>

        <Text style={tp.colon}>:</Text>

        <TouchableOpacity
          style={tp.btn}
          onPress={() => update(h12, m - 5, isPM)}
          hitSlop={HIT}
        >
          <Ionicons name="remove" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={tp.val}>{String(m).padStart(2, "0")}</Text>
        <TouchableOpacity
          style={tp.btn}
          onPress={() => update(h12, m + 5, isPM)}
          hitSlop={HIT}
        >
          <Ionicons name="add" size={16} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={tp.ampmBtn}
          onPress={() => update(h12, m, !isPM)}
        >
          <Text style={tp.ampmTxt}>{isPM ? "PM" : "AM"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  label: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13, width: 52 },
  controls: { flexDirection: "row", alignItems: "center", gap: 6 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  val: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.sansBold,
    width: 28,
    textAlign: "center",
  },
  colon: { color: colors.text, fontSize: 20, fontFamily: fonts.sansBold, marginHorizontal: 2 },
  ampmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 4,
  },
  ampmTxt: { color: colors.text, fontSize: 12, fontFamily: fonts.sansBold, letterSpacing: 0.5 },
});

// ---------------------------------------------------------------------------
// Date picker modal
// ---------------------------------------------------------------------------

function DatePickerModal({
  visible,
  value,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  value: string;
  onConfirm: (d: string) => void;
  onCancel: () => void;
}) {
  const parts = value.split("-");
  const initY = parseInt(parts[0], 10) || new Date().getFullYear();
  const initM = parseInt(parts[1], 10) - 1 || 0;
  const initD = parseInt(parts[2], 10) || 1;

  const [year, setYear] = useState(initY);
  const [month, setMonth] = useState(initM);
  const [day, setDay] = useState(initD);

  useEffect(() => {
    if (visible) {
      const p = value.split("-");
      setYear(parseInt(p[0], 10) || new Date().getFullYear());
      setMonth((parseInt(p[1], 10) || 1) - 1);
      setDay(parseInt(p[2], 10) || 1);
    }
  }, [visible, value]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);

  function confirm() {
    onConfirm(toDateString(new Date(year, month, clampedDay)));
  }

  function adj(
    setter: (v: number) => void,
    val: number,
    delta: number,
    min: number,
    max: number
  ) {
    let next = val + delta;
    if (next < min) next = max;
    if (next > max) next = min;
    setter(next);
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={dpm.overlay}>
        <View style={dpm.box}>
          <Text style={dpm.title}>Select Date</Text>
          <View style={dpm.row}>
            <View style={dpm.col}>
              <Text style={dpm.colLabel}>Month</Text>
              <TouchableOpacity onPress={() => adj(setMonth, month, -1, 0, 11)} style={dpm.arrow}>
                <Ionicons name="chevron-up" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={dpm.val}>{MONTH_NAMES[month].slice(0, 3)}</Text>
              <TouchableOpacity onPress={() => adj(setMonth, month, 1, 0, 11)} style={dpm.arrow}>
                <Ionicons name="chevron-down" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={dpm.col}>
              <Text style={dpm.colLabel}>Day</Text>
              <TouchableOpacity onPress={() => adj(setDay, clampedDay, -1, 1, daysInMonth)} style={dpm.arrow}>
                <Ionicons name="chevron-up" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={dpm.val}>{String(clampedDay).padStart(2, "0")}</Text>
              <TouchableOpacity onPress={() => adj(setDay, clampedDay, 1, 1, daysInMonth)} style={dpm.arrow}>
                <Ionicons name="chevron-down" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={dpm.col}>
              <Text style={dpm.colLabel}>Year</Text>
              <TouchableOpacity onPress={() => adj(setYear, year, -1, 2020, 2035)} style={dpm.arrow}>
                <Ionicons name="chevron-up" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={dpm.val}>{year}</Text>
              <TouchableOpacity onPress={() => adj(setYear, year, 1, 2020, 2035)} style={dpm.arrow}>
                <Ionicons name="chevron-down" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={dpm.actions}>
            <TouchableOpacity style={dpm.cancelBtn} onPress={onCancel}>
              <Text style={dpm.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dpm.confirmBtn} onPress={confirm}>
              <Text style={dpm.confirmTxt}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dpm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    width: 320,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.sansBold,
    textAlign: "center",
    marginBottom: 20,
  },
  row: { flexDirection: "row", justifyContent: "space-around", marginBottom: 24 },
  col: { alignItems: "center", gap: 4 },
  colLabel: {
    color: colors.textMuted,
    fontFamily: fonts.sans, fontSize: 11,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  arrow: { padding: 4 },
  val: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.sansBold,
    minWidth: 52,
    textAlign: "center",
    paddingVertical: 4,
  },
  actions: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  cancelTxt: { color: colors.text, fontSize: 15, fontFamily: fonts.sansSemiBold },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: "center",
  },
  confirmTxt: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.sansBold },
});

// ---------------------------------------------------------------------------
// Event Modal (Add / Edit)
// ---------------------------------------------------------------------------

type ModalMode = "add" | "edit";

type EventModalProps = {
  visible: boolean;
  mode: ModalMode;
  initial: Partial<CalendarEvent>;
  onSave: (ev: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
};

function EventModal({
  visible,
  mode,
  initial,
  onSave,
  onDelete,
  onCancel,
}: EventModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDateString(new Date()));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [notes, setNotes] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial.title ?? "");
      setDate(initial.date ?? toDateString(new Date()));
      setStartTime(initial.startTime ?? "08:00");
      setEndTime(initial.endTime ?? "09:00");
      setColor(initial.color ?? EVENT_COLORS[0]);
      setNotes(initial.notes ?? "");
      setShowDatePicker(false);
    }
  }, [visible, initial]);

  function handleSave() {
    if (!title.trim()) {
      notifyMessage("Title required", "Please enter a title for this event.");
      return;
    }
    if (!isValidTime(startTime)) {
      notifyMessage("Invalid start time", "Enter time as HH:MM (e.g. 09:00).");
      return;
    }
    if (!isValidTime(endTime)) {
      notifyMessage("Invalid end time", "Enter time as HH:MM (e.g. 10:00).");
      return;
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      notifyMessage("Invalid times", "End time must be after start time.");
      return;
    }
    onSave({
      id: initial.id ?? genId(),
      title: title.trim(),
      date,
      startTime,
      endTime,
      color,
      notes: notes.trim() || undefined,
    });
  }

  function handleDelete() {
    if (!initial.id) return;
    confirmAction("Delete event?", `"${title}" will be removed.`, "Delete", () => onDelete(initial.id!));
  }

  function formatDate(ds: string): string {
    const parts = ds.split("-");
    if (parts.length < 3) return ds;
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    return `${DAY_LABELS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  }

  return (
    <>
      <DatePickerModal
        visible={showDatePicker}
        value={date}
        onConfirm={(d) => {
          setDate(d);
          setShowDatePicker(false);
        }}
        onCancel={() => setShowDatePicker(false)}
      />
      <Modal visible={visible && !showDatePicker} transparent animationType="slide">
        <Pressable style={em.overlay} onPress={onCancel}>
          <Pressable style={em.sheet} onPress={() => {}}>
            <View style={em.handle} />
            <Text style={em.heading}>
              {mode === "add" ? "New Event" : "Edit Event"}
            </Text>

            <Text style={em.fieldLabel}>Title</Text>
            <TextInput
              style={em.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={colors.textFaint}
              maxLength={80}
              returnKeyType="done"
            />

            <Text style={em.fieldLabel}>Date</Text>
            <TouchableOpacity
              style={em.dateRow}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={16} color={ACCENT} style={{ marginRight: 8 }} />
              <Text style={em.dateText}>{formatDate(date)}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
            </TouchableOpacity>

            <Text style={em.fieldLabel}>Time</Text>
            <TimePicker label="Start" value={startTime} onChange={setStartTime} />
            <TimePicker label="End" value={endTime} onChange={setEndTime} />

            <Text style={em.fieldLabel}>Color</Text>
            <View style={em.colorRow}>
              {EVENT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  style={[em.swatch, { backgroundColor: c }, color === c && em.swatchSelected]}
                >
                  {color === c && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={em.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[em.input, em.inputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes…"
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={3}
              maxLength={500}
            />

            <View style={em.actions}>
              {mode === "edit" && (
                <TouchableOpacity style={em.deleteBtn} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={em.cancelBtn} onPress={onCancel}>
                <Text style={em.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={em.saveBtn} onPress={handleSave}>
                <Text style={em.saveTxt}>{mode === "add" ? "Add" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const em = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  heading: { color: colors.text, fontSize: 18, fontFamily: fonts.sansBold, marginBottom: 20, textAlign: "center" },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMulti: { height: 72, textAlignVertical: "top" },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: { color: colors.text, fontFamily: fonts.sans, fontSize: 15, flex: 1 },
  colorRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  swatchSelected: { borderWidth: 2, borderColor: colors.border },
  actions: { flexDirection: "row", gap: 10, marginTop: 8, alignItems: "center" },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F3E3E0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  cancelTxt: { color: colors.text, fontSize: 15, fontFamily: fonts.sansSemiBold },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center" },
  saveTxt: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.sansBold },
});

// ---------------------------------------------------------------------------
// Week header
// ---------------------------------------------------------------------------

type WeekHeaderProps = {
  weekDays: Date[];
  todayStr: string;
  onPrev: () => void;
  onNext: () => void;
};

function WeekHeader({ weekDays, todayStr, onPrev, onNext }: WeekHeaderProps) {
  const firstDay = weekDays[0];
  const lastDay = weekDays[6];

  let monthLabel: string;
  if (firstDay.getMonth() === lastDay.getMonth()) {
    monthLabel = `${MONTH_NAMES[firstDay.getMonth()]} ${firstDay.getFullYear()}`;
  } else {
    const mA = MONTH_NAMES[firstDay.getMonth()].slice(0, 3);
    const mB = MONTH_NAMES[lastDay.getMonth()].slice(0, 3);
    const yr =
      firstDay.getFullYear() === lastDay.getFullYear()
        ? ` ${firstDay.getFullYear()}`
        : ` ${firstDay.getFullYear()} / ${lastDay.getFullYear()}`;
    monthLabel = `${mA} – ${mB}${yr}`;
  }

  return (
    <View style={wh.container}>
      <View style={wh.monthRow}>
        <TouchableOpacity
          style={wh.arrow}
          onPress={onPrev}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={wh.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          style={wh.arrow}
          onPress={onNext}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={wh.daysRow}>
        <View style={{ width: TIME_COL_WIDTH }} />
        {weekDays.map((d, i) => {
          const ds = toDateString(d);
          const isToday = ds === todayStr;
          return (
            <View key={i} style={wh.dayCol}>
              <Text style={wh.dayName}>{DAY_LABELS[i]}</Text>
              <View style={[wh.dateBubble, isToday && { backgroundColor: ACCENT }]}>
                <Text style={[wh.dateNum, isToday && { color: colors.onPrimary, fontFamily: fonts.sansBold }]}>
                  {d.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const wh = StyleSheet.create({
  container: {
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 4,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { color: colors.text, fontSize: 15, fontFamily: fonts.sansBold, letterSpacing: 0.3 },
  daysRow: { flexDirection: "row", paddingBottom: 8 },
  dayCol: { width: DAY_COL_WIDTH, alignItems: "center", gap: 2 },
  dayName: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dateBubble: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dateNum: { color: colors.text, fontSize: 14, fontFamily: fonts.sansSemiBold },
});

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

// Returns the column index and total simultaneous columns for each event so
// only truly time-overlapping events share column space. Non-overlapping events
// each get the full day-column width.
function computeOverlapInfo(
  events: CalendarEvent[]
): Map<string, { col: number; totalCols: number }> {
  const result = new Map<string, { col: number; totalCols: number }>();
  if (events.length === 0) return result;
  const sorted = [...events].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  for (const ev of sorted) {
    const evStart = timeToMinutes(ev.startTime);
    const evEnd = timeToMinutes(ev.endTime);
    const overlapping = sorted.filter((other) => {
      const oStart = timeToMinutes(other.startTime);
      const oEnd = timeToMinutes(other.endTime);
      return oStart < evEnd && oEnd > evStart;
    });
    result.set(ev.id, {
      col: overlapping.findIndex((e) => e.id === ev.id),
      totalCols: overlapping.length,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Event block
// ---------------------------------------------------------------------------

type EventBlockProps = {
  event: CalendarEvent;
  col: number;
  totalCols: number;
  onPress: (ev: CalendarEvent) => void;
};

function EventBlock({ event, col, totalCols, onPress }: EventBlockProps) {
  const startParts = event.startTime.split(":");
  const endParts = event.endTime.split(":");
  const startH = parseInt(startParts[0], 10);
  const startM = parseInt(startParts[1], 10);
  const endH = parseInt(endParts[0], 10);
  const endM = parseInt(endParts[1], 10);

  const top = timeToY(startH, startM);
  const height = Math.max(timeToY(endH, endM) - top, 24);

  const slotWidth = totalCols > 1 ? (DAY_COL_WIDTH * 0.9) / totalCols : DAY_COL_WIDTH * 0.94;
  const left = col * ((DAY_COL_WIDTH * 0.9) / totalCols);

  return (
    <TouchableOpacity
      style={[
        eb.block,
        { top, height, width: slotWidth, left, backgroundColor: event.color + "26", borderLeftColor: event.color },
      ]}
      onPress={() => onPress(event)}
      activeOpacity={0.75}
    >
      <Text style={eb.title} numberOfLines={height > 38 ? 2 : 1}>
        {event.title}
      </Text>
      {height >= 30 && (
        <Text style={eb.time}>{formatTime12(event.startTime)}</Text>
      )}
    </TouchableOpacity>
  );
}

const eb = StyleSheet.create({
  block: {
    position: "absolute",
    borderRadius: 8,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    overflow: "hidden",
  },
  title: { color: colors.text, fontSize: 12, fontFamily: fonts.sansBold, lineHeight: 15 },
  time: { color: colors.text, fontFamily: fonts.sans, fontSize: 10, marginTop: 1 },
});

// ---------------------------------------------------------------------------
// Time grid
// ---------------------------------------------------------------------------

type TimeGridProps = {
  weekDays: Date[];
  events: CalendarEvent[];
  onPressSlot: (date: string, hour: number) => void;
  onPressEvent: (ev: CalendarEvent) => void;
};

function TimeGrid({ weekDays, events, onPressSlot, onPressEvent }: TimeGridProps) {
  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) hours.push(h);
  const totalHeight = (GRID_END_HOUR - GRID_START_HOUR + 1) * HOUR_HEIGHT;

  const scrollRef = useRef<ScrollView>(null);

  // Scroll to 1 hour before current time so today's events are visible
  useEffect(() => {
    const now = new Date();
    const h = Math.max(GRID_START_HOUR, now.getHours() - 1);
    const offset = (h - GRID_START_HOUR) * HOUR_HEIGHT;
    setTimeout(() => scrollRef.current?.scrollTo({ y: offset, animated: false }), 100);
  }, []);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  return (
    <ScrollView
      ref={scrollRef}
      style={tg.scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <View style={{ height: totalHeight, flexDirection: "row" }}>
        <View style={tg.timeCol}>
          {hours.map((h) => (
            <View key={h} style={tg.hourLabelRow}>
              <Text style={tg.hourLabel}>
                {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
              </Text>
            </View>
          ))}
        </View>
        {weekDays.map((d, dayIdx) => {
          const ds = toDateString(d);
          const dayEvents = eventsByDay[ds] ?? [];
          const overlap = computeOverlapInfo(dayEvents);
          return (
            <View key={dayIdx} style={[tg.dayCol, { width: DAY_COL_WIDTH }]}>
              {hours.map((h) => (
                <TouchableOpacity
                  key={h}
                  style={tg.hourSlot}
                  onPress={() => onPressSlot(ds, h)}
                  activeOpacity={0.6}
                />
              ))}
              {dayEvents.map((ev) => {
                const info = overlap.get(ev.id) ?? { col: 0, totalCols: 1 };
                return (
                  <EventBlock
                    key={ev.id}
                    event={ev}
                    col={info.col}
                    totalCols={info.totalCols}
                    onPress={onPressEvent}
                  />
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const tg = StyleSheet.create({
  scroll: { flex: 1 },
  timeCol: { width: TIME_COL_WIDTH },
  hourLabelRow: {
    height: HOUR_HEIGHT,
    justifyContent: "flex-start",
    paddingTop: 2,
    paddingRight: 6,
    alignItems: "flex-end",
  },
  hourLabel: { color: colors.textFaint, fontSize: 10, fontFamily: fonts.sansMedium },
  dayCol: { borderLeftWidth: 1, borderLeftColor: colors.border, position: "relative" },
  hourSlot: { height: HOUR_HEIGHT, borderTopWidth: 1, borderTopColor: colors.border },
});

// ---------------------------------------------------------------------------
// Visibility Settings Modal
// ---------------------------------------------------------------------------

const VISIBILITY_OPTIONS: Array<{
  key: CalendarVisibility;
  title: string;
  desc: string;
  icon: string;
}> = [
  {
    key: "full",
    title: "Full details",
    desc: "Connections can see all event titles, times, and notes",
    icon: "calendar",
  },
  {
    key: "availability",
    title: "Availability only",
    desc: "Connections see when you're busy or free — no event titles",
    icon: "time-outline",
  },
  {
    key: "hidden",
    title: "Private",
    desc: "Connections cannot view your schedule at all",
    icon: "eye-off-outline",
  },
];

function VisibilitySettingsModal({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: CalendarVisibility;
  onChange: (v: CalendarVisibility) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={vm.overlay} onPress={onClose}>
        <Pressable style={vm.sheet} onPress={() => {}}>
          <View style={vm.handle} />
          <Text style={vm.title}>Calendar Visibility</Text>
          <Text style={vm.subtitle}>
            Choose what connections see when they view your schedule
          </Text>
          {VISIBILITY_OPTIONS.map((opt) => {
            const selected = value === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[vm.option, selected && vm.optionSelected]}
                onPress={() => { onChange(opt.key); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[vm.iconWrap, selected && vm.iconWrapSelected]}>
                  <Ionicons
                    name={opt.icon as any}
                    size={20}
                    color={selected ? colors.text : colors.textMuted}
                  />
                </View>
                <View style={vm.optText}>
                  <Text style={[vm.optTitle, selected && vm.optTitleSelected]}>{opt.title}</Text>
                  <Text style={vm.optDesc}>{opt.desc}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={20} color={ACCENT} />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={vm.doneBtn} onPress={onClose}>
            <Text style={vm.doneTxt}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const vm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: { color: colors.text, fontSize: 18, fontFamily: fonts.sansBold, marginBottom: 6 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13, marginBottom: 20, lineHeight: 18 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { backgroundColor: "#E3E8E3", borderColor: ACCENT },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapSelected: { backgroundColor: ACCENT },
  optText: { flex: 1 },
  optTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.sansSemiBold },
  optTitleSelected: { color: colors.text },
  optDesc: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2, lineHeight: 16 },
  doneBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  doneTxt: { color: colors.text, fontSize: 15, fontFamily: fonts.sansSemiBold },
});

// ---------------------------------------------------------------------------
// Sync Setup Instructions Modal
// ---------------------------------------------------------------------------

function SyncHelpModal({
  visible,
  onConnect,
  onCancel,
}: {
  visible: boolean;
  onConnect: () => void;
  onCancel: () => void;
}) {
  const steps = [
    "Open the iOS Settings app",
    "Tap Calendar → Accounts",
    "Tap Add Account → Google",
    "Sign in with your Google account",
    'Enable Calendars and tap Save',
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={shm.overlay} onPress={onCancel}>
        <Pressable style={shm.sheet} onPress={() => {}}>
          <View style={shm.handle} />
          <View style={shm.iconWrap}>
            <Ionicons name="calendar" size={30} color={ACCENT} />
          </View>
          <Text style={shm.title}>Sync Your Google Calendar</Text>
          <Text style={shm.subtitle}>
            Connect Google to iOS Calendar so inStereo can read your events.
            This is a one-time setup — do it once and it syncs automatically.
          </Text>
          <View style={shm.stepsCard}>
            {steps.map((step, i) => (
              <View key={i} style={shm.stepRow}>
                <View style={shm.stepBadge}>
                  <Text style={shm.stepNum}>{i + 1}</Text>
                </View>
                <Text style={shm.stepTxt}>{step}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={shm.connectBtn} onPress={onConnect}>
            <Ionicons name="link" size={16} color={colors.onPrimary} style={{ marginRight: 8 }} />
            <Text style={shm.connectTxt}>I've done this — Connect Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={shm.laterBtn} onPress={onCancel}>
            <Text style={shm.laterTxt}>Maybe later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const shm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 24,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#E3E8E3",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: 18,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontFamily: fonts.sansBold,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.sans, fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 24,
  },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNum: { color: colors.onPrimary, fontSize: 13, fontFamily: fonts.sansBold },
  stepTxt: { color: colors.text, fontFamily: fonts.sans, fontSize: 14, flex: 1, lineHeight: 20 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 17,
    marginBottom: 12,
  },
  connectTxt: { color: colors.onPrimary, fontSize: 16, fontFamily: fonts.sansBold },
  laterBtn: { alignItems: "center", paddingVertical: 10 },
  laterTxt: { color: colors.textFaint, fontFamily: fonts.sans, fontSize: 14 },
});

// ---------------------------------------------------------------------------
// Device Calendar Sync Banner
// ---------------------------------------------------------------------------

const VIS_LABEL: Record<CalendarVisibility, string> = {
  full: "Full details",
  availability: "Availability only",
  hidden: "Private",
};

type SyncBannerProps = {
  synced: boolean;
  eventCount: number;
  loading: boolean;
  onSync: () => void;
  onRevoke: () => void;
  visibility: CalendarVisibility;
  onVisibilityPress: () => void;
};

function DeviceSyncBanner({
  synced,
  eventCount,
  loading,
  onSync,
  onRevoke,
  visibility,
  onVisibilityPress,
}: SyncBannerProps) {
  return (
    <View style={dsb.bar}>
      <TouchableOpacity
        style={dsb.left}
        onPress={synced ? onRevoke : onSync}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Ionicons
          name="calendar"
          size={16}
          color={synced ? colors.accent : colors.textMuted}
        />
        {loading ? (
          <>
            <ActivityIndicator size="small" color={ACCENT} style={{ marginLeft: 4 }} />
            <Text style={dsb.disconnTxt}>Syncing…</Text>
          </>
        ) : synced ? (
          <>
            <View style={dsb.dot} />
            <Text style={dsb.connTxt}>
              {eventCount} event{eventCount !== 1 ? "s" : ""} synced · tap to remove
            </Text>
          </>
        ) : (
          <Text style={dsb.disconnTxt}>Tap to sync your calendars</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={dsb.visBtn} onPress={onVisibilityPress}>
        <Ionicons
          name={
            visibility === "hidden"
              ? "eye-off-outline"
              : visibility === "availability"
                ? "time-outline"
                : "eye-outline"
          }
          size={13}
          color={ACCENT}
        />
        <Text style={dsb.visTxt}>{VIS_LABEL[visibility]}</Text>
        <Ionicons name="chevron-forward" size={11} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const dsb = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accent },
  connTxt: { color: colors.text, fontSize: 12, fontFamily: fonts.sansSemiBold },
  disconnTxt: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.sansMedium },
  visBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E3E8E3",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  visTxt: { color: ACCENT, fontSize: 11, fontFamily: fonts.sansSemiBold },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [modalInitial, setModalInitial] = useState<Partial<CalendarEvent>>({});

  const [deviceEvents, setDeviceEvents] = useState<CalendarEvent[]>([]);
  const [deviceEventCount, setDeviceEventCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null); // null = not yet checked
  const [syncLoading, setSyncLoading] = useState(false);

  const [visibility, setVisibility] = useState<CalendarVisibility>("full");
  const [showVisibility, setShowVisibility] = useState(false);
  const [showSyncHelp, setShowSyncHelp] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateString(today), [today]);

  const weekDays = useMemo<Date[]>(() => {
    const base = startOfWeek(today);
    const shifted = addDays(base, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(shifted, i));
  }, [today, weekOffset]);

  // iOS 17+ distinguishes "write-only" from "full access".
  // getEventsAsync requires full access — write-only returns 0 events silently.
  async function hasFullCalendarAccess(): Promise<boolean> {
    const perm = await Calendar.getCalendarPermissionsAsync();
    if (perm.status !== "granted") return false;
    // accessPrivileges is iOS 17+ only; if absent we have full access (pre-17)
    const priv = (perm as any).accessPrivileges;
    if (priv === "writeOnly") return false;
    return true;
  }

  async function requestFullAccess(): Promise<boolean> {
    if (Platform.OS === "ios") {
      // requestFullCalendarAccessAsync → "Full Access" prompt on iOS 17+
      const result = await (Calendar as any).requestFullCalendarAccessAsync?.();
      if (result) return result.status === "granted";
      // Fallback for older expo-calendar builds that don't expose the method
    }
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === "granted";
  }

  // On mount: load local data then check OS permission status
  useEffect(() => {
    Promise.all([
      loadEvents(),
      AsyncStorage.getItem(VISIBILITY_KEY),
    ]).then(([localEvs, visRaw]) => {
      setEvents(localEvs);
      if (visRaw) setVisibility(visRaw as CalendarVisibility);
    });

    hasFullCalendarAccess().then((granted) => {
      setPermissionGranted(granted);
      if (granted) syncDeviceCalendar();
    });
  }, []);

  // Re-sync every time this tab is focused
  useFocusEffect(
    useCallback(() => {
      if (permissionGranted) syncDeviceCalendar();
    }, [permissionGranted])
  );

  // Live refresh: poll every 30 seconds while tab is active
  useEffect(() => {
    if (!permissionGranted) return;
    const id = setInterval(() => syncDeviceCalendar(), 30_000);
    return () => clearInterval(id);
  }, [permissionGranted]);

  async function syncDeviceCalendar() {
    setSyncLoading(true);
    try {
      // Re-verify full access before each sync (user may have changed it in Settings)
      const ok = await hasFullCalendarAccess();
      if (!ok) {
        setPermissionGranted(false);
        setDeviceEvents([]);
        setDeviceEventCount(0);
        setSyncLoading(false);
        return;
      }

      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      console.log("[Cal] found", cals.length, "calendars:", cals.map((c) => c.title).join(", "));

      const rangeStart = addDays(today, -60);
      const rangeEnd = addDays(today, 60);

      // Fetch per-calendar so a bad calendar can't silently drop everything
      const allRaw: Calendar.Event[] = [];
      for (const cal of cals) {
        try {
          const evs = await Calendar.getEventsAsync([cal.id], rangeStart, rangeEnd);
          console.log(`[Cal] "${cal.title}": ${evs.length} events`);
          allRaw.push(...evs);
        } catch (calErr) {
          console.warn(`[Cal] failed for "${cal.title}":`, calErr);
        }
      }

      console.log("[Cal] total raw:", allRaw.length);
      if (allRaw.length > 0) {
        const s = allRaw[0];
        console.log("[Cal] first event:", JSON.stringify({
          title: s.title, allDay: s.allDay,
          startDate: s.startDate, endDate: s.endDate,
        }));
      }

      const calColorMap: Record<string, string> = {};
      for (const c of cals) calColorMap[c.id] = c.color || "#60a5fa";

      const mapped = allRaw
        .map((ev) => mapDeviceEvent(ev, calColorMap[ev.calendarId] || "#60a5fa"))
        .filter((e): e is CalendarEvent => e !== null);

      setDeviceEvents(mapped);
      setDeviceEventCount(mapped.length);
    } catch (err) {
      console.warn("[inStereo] Calendar sync error:", err);
    } finally {
      setSyncLoading(false);
    }
  }

  function handleSyncBannerPress() {
    setShowSyncHelp(true);
  }

  async function handleRequestPermission() {
    setSyncLoading(true);
    try {
      const granted = await requestFullAccess();
      if (granted) {
        setPermissionGranted(true);
        await syncDeviceCalendar();
      } else {
        Alert.alert(
          "Full calendar access needed",
          'Go to Settings → Privacy & Security → Calendars → Expo Go and choose "Full Access".'
        );
      }
    } finally {
      setSyncLoading(false);
    }
  }

  function handleRevoke() {
    confirmAction(
      "Remove calendar sync?",
      "Your device calendar events will be hidden from inStereo. You can re-enable this at any time.",
      "Remove",
      () => {
        setPermissionGranted(false);
        setDeviceEvents([]);
        setDeviceEventCount(0);
      }
    );
  }

  function handleVisibilityChange(v: CalendarVisibility) {
    setVisibility(v);
    AsyncStorage.setItem(VISIBILITY_KEY, v);
  }

  const allEvents = useMemo(
    () => [...events, ...deviceEvents],
    [events, deviceEvents]
  );

  // Push a redacted copy to every connection whenever the shareable data
  // actually changes — skips the write if nothing changed, since
  // syncDeviceCalendar() re-polls every 30s regardless of whether anything
  // on the device actually did.
  const lastPublishedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const redacted = redactForSharing(allEvents, visibility);
    const key = JSON.stringify({ redacted, visibility });
    if (key === lastPublishedRef.current) return;
    lastPublishedRef.current = key;
    updateUserProfile(user.uid, { calendarEvents: redacted, calendarVisibility: visibility });
  }, [allEvents, visibility, user?.uid]);

  async function persistEvents(updated: CalendarEvent[]) {
    setEvents(updated);
    await saveEvents(updated);
  }

  const handleSave = useCallback(
    async (ev: CalendarEvent) => {
      setModalVisible(false);
      const updated =
        modalMode === "add"
          ? [...events, ev]
          : events.map((e) => (e.id === ev.id ? ev : e));
      await persistEvents(updated);
    },
    [events, modalMode]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setModalVisible(false);
      await persistEvents(events.filter((e) => e.id !== id));
    },
    [events]
  );

  function openAddModal(date: string, hour: number) {
    const startH = String(Math.min(hour, 22)).padStart(2, "0");
    const endH = String(Math.min(hour + 1, 23)).padStart(2, "0");
    setModalMode("add");
    setModalInitial({ date, startTime: `${startH}:00`, endTime: `${endH}:00`, color: EVENT_COLORS[0] });
    setModalVisible(true);
  }

  function openEditModal(ev: CalendarEvent) {
    if (ev.source === "device") {
      Alert.alert(
        ev.title,
        `${ev.date}\n${formatTime12(ev.startTime)} – ${formatTime12(ev.endTime)}${ev.notes ? `\n\n${ev.notes}` : ""}`,
        [{ text: "Close", style: "cancel" }]
      );
      return;
    }
    setModalMode("edit");
    setModalInitial(ev);
    setModalVisible(true);
  }

  // Permission not yet checked — still loading
  if (permissionGranted === null) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <ScreenHeading eyebrow="Shared availability" title="Find a moment that works." />

      <WeekHeader
        weekDays={weekDays}
        todayStr={todayStr}
        onPrev={() => setWeekOffset((o) => o - 1)}
        onNext={() => setWeekOffset((o) => o + 1)}
      />

      <DeviceSyncBanner
        synced={permissionGranted}
        eventCount={deviceEventCount}
        loading={syncLoading}
        onSync={handleSyncBannerPress}
        onRevoke={handleRevoke}
        visibility={visibility}
        onVisibilityPress={() => setShowVisibility(true)}
      />

      <TimeGrid
        weekDays={weekDays}
        events={allEvents}
        onPressSlot={openAddModal}
        onPressEvent={openEditModal}
      />

      <EventModal
        visible={modalVisible}
        mode={modalMode}
        initial={modalInitial}
        onSave={handleSave}
        onDelete={handleDelete}
        onCancel={() => setModalVisible(false)}
      />

      <VisibilitySettingsModal
        visible={showVisibility}
        value={visibility}
        onChange={handleVisibilityChange}
        onClose={() => setShowVisibility(false)}
      />

      <SyncHelpModal
        visible={showSyncHelp}
        onConnect={() => {
          setShowSyncHelp(false);
          handleRequestPermission();
        }}
        onCancel={() => setShowSyncHelp(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
});
