import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { weekStartStr, weekStats } from "../components/pulse";
import type { Member } from "../context/MembersContext";
import { notifyOnce } from "./notifications";

// Watches your people and sends local notifications when:
//   • someone's weekly Pulse average is below 3 → "check in on them" (once a week each)
//   • someone's phone detects they're in a new city → "Mum is now in Abuja"
// Runs while the app is open; each alert fires at most once.

const KNOWN_CITIES_KEY = "instereo_known_cities";

export function useConnectionAlerts(members: Member[]) {
  useEffect(() => {
    if (!members.length) return;
    const week = weekStartStr();

    members.forEach((m) => {
      const { avg, needsCare } = weekStats(m.pulseScores);
      if (needsCare && avg !== null) {
        notifyOnce(
          `care-${m.uid}-${week}`,
          `Check in on ${m.name}`,
          `${m.name}'s week is averaging ${avg.toFixed(1)} out of 5. A quick message could mean a lot.`,
          { memberUid: m.uid, type: "care" },
        ).catch(() => {});
      }
    });

    (async () => {
      const raw = await AsyncStorage.getItem(KNOWN_CITIES_KEY);
      const known: Record<string, string> = raw ? JSON.parse(raw) : {};
      const next = { ...known };
      for (const m of members) {
        if (!m.city) continue;
        const before = known[m.uid];
        // Only automatic (GPS-detected) moves notify; a first sighting just records the city.
        if (before && before !== m.city && m.locationUpdatedAt) {
          await notifyOnce(
            `moved-${m.uid}-${m.city}-${new Date().toISOString().slice(0, 10)}`,
            `${m.name} is now in ${m.city}`,
            `${m.name}'s city just updated${m.country ? ` to ${m.city}, ${m.country}` : ""}.`,
            { memberUid: m.uid, type: "moved" },
          ).catch(() => {});
        }
        next[m.uid] = m.city;
      }
      await AsyncStorage.setItem(KNOWN_CITIES_KEY, JSON.stringify(next));
    })().catch(() => {});
  }, [members]);
}
