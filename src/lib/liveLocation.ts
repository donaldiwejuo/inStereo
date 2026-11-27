import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { updateUserProfile } from "./firestore";
import { searchPlaces } from "./geocode";

// Automatic city: while inStereo is open, the phone's GPS works out which
// city you're in, and only that city is shared — your pin sits at the city
// centre, never your exact position. Nothing is written until the city
// changes, and nothing is tracked when the app is closed.

const SETTINGS_KEY = "instereo_settings";
const REGEOCODE_MOVE_M = 2_000; // only look the city up again after moving 2 km

const listeners = new Set<(on: boolean) => void>();

export async function isLiveLocationOn(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw).shareLiveLocation !== false : true;
  } catch {
    return true;
  }
}

// Called by Settings after it saves the switch, so tracking starts/stops now.
export function announceLiveLocationSetting(on: boolean) {
  listeners.forEach((l) => l(on));
}

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type CityPlace = {
  city: string; region: string; country: string; countryCode: string;
  timezone: string; lat: number; lon: number; // lat/lon = the city centre
};

// GPS position → the city it's in, with the city centre's coordinates.
async function cityFor(lat: number, lon: number): Promise<CityPlace | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const name = a?.city || a?.subregion || a?.district || "";
    if (!a || !name) return null;
    const code = (a.isoCountryCode ?? "").toUpperCase();

    // Same lookup the manual city picker uses; of the matching cities in this
    // country, take the one nearest to us (there are many Springfields).
    const matches = (await searchPlaces(name)).filter((p) => !code || p.countryCode?.toUpperCase() === code);
    const here = { lat, lon };
    const best = matches.sort((x, y) => metersBetween(here, x) - metersBetween(here, y))[0];
    if (best && metersBetween(here, best) < 100_000) {
      return {
        city: best.city, region: best.region ?? a.region ?? "", country: best.country,
        countryCode: best.countryCode, timezone: best.timezone, lat: best.lat, lon: best.lon,
      };
    }

    // Not in the city list: share a coarse point (~10 km) instead of the GPS fix.
    let timezone = a.timezone ?? "";
    if (!timezone) {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&current=temperature_2m`);
      timezone = (await r.json())?.timezone ?? "";
    }
    if (!timezone || !a.country) return null;
    return {
      city: name, region: a.region ?? "", country: a.country, countryCode: code, timezone,
      lat: Number(lat.toFixed(1)), lon: Number(lon.toFixed(1)),
    };
  } catch {
    return null;
  }
}

// Mount once while signed in (the tabs layout). Returns whether your city is
// currently being kept up to date, so the UI can say so.
export function useLiveLocation(uid: string | undefined): boolean {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    isLiveLocationOn().then(setEnabled);
    listeners.add(setEnabled);
    return () => { listeners.delete(setEnabled); };
  }, []);

  useEffect(() => {
    if (!uid || !enabled) {
      setSharing(false);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let lastCheck: { lat: number; lon: number } | null = null;
    let sharedCity = "";

    async function onPosition(pos: Location.LocationObject) {
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (lastCheck && metersBetween(lastCheck, here) < REGEOCODE_MOVE_M) return;
      lastCheck = here;
      const place = await cityFor(here.lat, here.lon);
      if (!place || cancelled) return;
      const key = `${place.city}|${place.countryCode}`;
      if (key === sharedCity) return; // same city — nothing to share
      sharedCity = key;
      await updateUserProfile(uid!, { ...place, locationUpdatedAt: Date.now() })
        .catch((err) => console.warn("[inStereo] automatic city save failed:", err));
    }

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") return;
      setSharing(true);
      sub = await Location.watchPositionAsync(
        // ~1 km accuracy is plenty to tell which city you're in, and easy on the battery.
        { accuracy: Location.Accuracy.Low, distanceInterval: 500 },
        (pos) => { onPosition(pos); },
      );
      if (cancelled) sub.remove();
    })().catch(() => setSharing(false));

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [uid, enabled]);

  return sharing;
}
