import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import WebView from "react-native-webview";
import { Avatar, ScreenHeading } from "../../components/ui";
import { Member, useMembers } from "../../context/MembersContext";
import { colors, fonts, radius, type } from "../../theme";

const GLOBE_H = 360;

function localTime(tz: string | undefined, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", hour: "numeric", minute: "2-digit" }).format(now);
  } catch {
    return "";
  }
}

// " · Updated automatically" when their phone detected the city itself.
function liveLabel(updatedAt: number | undefined, _now: Date): string {
  return updatedAt ? " · Updated automatically" : "";
}

// ─── Flat-map fallback (used when globe.gl CDN is unreachable) ──────────────

type Cluster = { city: string; lat: number; lon: number; members: Member[] };

function FlatMapView({ members, width, onCityPress }: {
  members: Member[]; width: number; onCityPress: (city: string, memberIds: number[]) => void;
}) {
  const clusters = useMemo<Cluster[]>(() => {
    const map: Record<string, Cluster> = {};
    members.forEach((m) => {
      if (!map[m.city]) map[m.city] = { city: m.city, lat: m.lat, lon: m.lon, members: [] };
      map[m.city].members.push(m);
    });
    return Object.values(map);
  }, [members]);
  const toXY = (lat: number, lon: number) => ({ x: ((lon + 180) / 360) * width, y: ((90 - lat) / 180) * GLOBE_H });

  return (
    <View style={[s.globe, { width }]}>
      {[-60, -30, 0, 30, 60].map((lat) => (
        <View key={lat} style={[s.gridH, { top: toXY(lat, 0).y }]} />
      ))}
      {clusters.map((c) => {
        const { x, y } = toXY(c.lat, c.lon);
        return (
          <TouchableOpacity
            key={c.city}
            style={[s.flatPin, { left: x - 18, top: y - 18 }]}
            onPress={() => onCityPress(c.city, c.members.map((m) => m.id))}
          >
            <Avatar person={c.members[0]} size={30} ring />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Globe HTML template ─────────────────────────────────────────────────────

const GLOBE_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#E9EEF0; overflow:hidden; }
</style>
</head>
<body>
<div id="g" style="width:100vw;height:100vh"></div>
<script>
var MEMBERS = __MEMBERS_DATA__;
var started = false;

var killTimer = setTimeout(function() {
  if (!started) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:'timeout'})); } catch(e) {}
  }
}, 14000);

function startGlobe() {
  try {
    started = true;
    clearTimeout(killTimer);

    var el = document.getElementById('g');
    var myGlobe = Globe()(el);

    myGlobe
      .width(window.innerWidth)
      .height(window.innerHeight)
      .backgroundColor('#E9EEF0')
      .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe@2/example/img/earth-blue-marble.jpg')
      .showAtmosphere(true)
      .atmosphereColor('#ffffff')
      .atmosphereAltitude(0.18);

    myGlobe.renderer().setPixelRatio(window.devicePixelRatio || 2);

    // Cluster by city
    var cityMap = {};
    MEMBERS.forEach(function(m) {
      if (!cityMap[m.city]) cityMap[m.city] = { lat: m.lat, lng: m.lon, city: m.city, ids: [], people: [] };
      cityMap[m.city].ids.push(m.id);
      cityMap[m.city].people.push(m);
    });
    var clusters = Object.values(cityMap);

    // Custom map-pin HTML elements
    myGlobe
      .htmlElementsData(clusters)
      .htmlLat(function(d) { return d.lat; })
      .htmlLng(function(d) { return d.lng; })
      .htmlAltitude(0.01)
      .htmlTransitionDuration(0)
      .htmlElement(function(d) {
        // Built with DOM APIs (not innerHTML) so names and cities are always
        // treated as text.
        var first = d.people[0];
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px';
        var face = document.createElement('div');
        face.style.cssText = 'position:relative;width:46px;height:46px;border-radius:50%;border:3px solid #fff;background:#DCDDD6;box-shadow:0 4px 12px rgba(35,40,42,0.25);display:flex;align-items:center;justify-content:center;overflow:visible;font:500 18px Georgia,serif;color:#23282A';
        if (first.photo) {
          var img = document.createElement('img');
          img.src = first.photo;
          img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover';
          face.appendChild(img);
        } else {
          face.textContent = (first.name || '?').charAt(0).toUpperCase();
        }
        if (d.ids.length > 1) {
          var badge = document.createElement('div');
          badge.textContent = String(d.ids.length);
          badge.style.cssText = 'position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#3F4B43;color:#fff;font:700 10px -apple-system,sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff';
          face.appendChild(badge);
        }
        var label = document.createElement('div');
        label.textContent = d.city;
        label.style.cssText = 'background:rgba(251,251,248,0.95);border-radius:8px;padding:2px 8px;white-space:nowrap;color:#23282A;font:600 10px -apple-system,sans-serif;box-shadow:0 1px 4px rgba(35,40,42,0.15)';
        wrap.appendChild(face);
        wrap.appendChild(label);
        return wrap;
      });

    // Document-level tap detector: reliable pin clicks on iOS WKWebView
    var tapStart = null;
    document.addEventListener('touchstart', function(e) {
      if (e.touches.length !== 1) { tapStart = null; return; }
      tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      if (!tapStart || e.changedTouches.length !== 1) { tapStart = null; return; }
      var ex = e.changedTouches[0].clientX;
      var ey = e.changedTouches[0].clientY;
      var dx = ex - tapStart.x;
      var dy = ey - tapStart.y;
      var dt = Date.now() - tapStart.t;
      tapStart = null;
      if (Math.sqrt(dx * dx + dy * dy) > 14 || dt > 500) return; // drag or hold
      var hit = null;
      clusters.forEach(function(d) {
        try {
          var sc = myGlobe.getScreenCoords(d.lat, d.lng, 0.01);
          if (!sc) return;
          var ddx = ex - sc.x;
          var ddy = ey - sc.y;
          if (Math.sqrt(ddx * ddx + ddy * ddy) < 48) hit = d;
        } catch(e2) {}
      });
      if (hit) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'pin-click', city: hit.city, memberIds: hit.ids})); } catch(e3) {}
      }
    }, false);

    var ctrl = myGlobe.controls();
    ctrl.autoRotate = true;
    ctrl.autoRotateSpeed = 0.4;
    ctrl.enableZoom = true;
    ctrl.minDistance = 150;
    ctrl.maxDistance = 600;

    window.addEventListener('resize', function() {
      myGlobe.width(window.innerWidth).height(window.innerHeight);
    });
  } catch(err) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:String(err)})); } catch(e) {}
  }
}

function tryLoad(src, onOk, onFail) {
  var s = document.createElement('script');
  s.src = src;
  s.onload = onOk;
  s.onerror = onFail;
  document.head.appendChild(s);
}

tryLoad(
  'https://cdn.jsdelivr.net/npm/globe.gl@2/dist/globe.gl.min.js',
  startGlobe,
  function() {
    tryLoad(
      'https://unpkg.com/globe.gl@2/dist/globe.gl.min.js',
      startGlobe,
      function() {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:'cdn-failed'})); } catch(e) {}
      }
    );
  }
);
</script>
</body>
</html>`;

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function WorldScreen() {
  const { members } = useMembers();
  const [useFlatMap, setUseFlatMap] = useState(false);
  const [globeWidth, setGlobeWidth] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [selectedCity, setSelectedCity] = useState<{ city: string; memberIds: number[] } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const cityMembers = selectedCity ? members.filter((m) => selectedCity.memberIds.includes(m.id)) : [];
  const cityCount = new Set(members.map((m) => m.city)).size;

  // Keyed on the pin data itself (not the members array) so the globe only
  // reloads when someone's pin actually moves or is relabeled — not on every
  // snapshot, e.g. a pulse score update, which would reset the user's spin.
  const pinsJson = JSON.stringify(
    // Rounded so the globe only reloads when someone actually changes city.
    members.map((m) => ({ id: m.id, name: m.name, city: m.city, lat: +m.lat.toFixed(2), lon: +m.lon.toFixed(2), photo: m.photoUri ?? "" }))
  ).replace(/</g, "\\u003c"); // keep data from closing the <script> tag
  const html = useMemo(() => GLOBE_HTML_TEMPLATE.replace("__MEMBERS_DATA__", pinsJson), [pinsJson]);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "error") setUseFlatMap(true);
      else if (msg.type === "pin-click") setSelectedCity({ city: msg.city, memberIds: msg.memberIds });
    } catch {}
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <ScreenHeading
          eyebrow="World"
          title="Where your people are."
          subtitle={members.length ? `${members.length} ${members.length === 1 ? "person" : "people"} across ${cityCount} ${cityCount === 1 ? "city" : "cities"}.` : undefined}
        />

        <View style={s.body}>
          <View style={s.globeCard} onLayout={(e) => setGlobeWidth(e.nativeEvent.layout.width)}>
            {useFlatMap ? (
              globeWidth > 0 && (
                <FlatMapView members={members} width={globeWidth} onCityPress={(city, memberIds) => setSelectedCity({ city, memberIds })} />
              )
            ) : (
              <WebView
                source={{ html }}
                style={s.globe}
                onMessage={handleMessage}
                javaScriptEnabled
                originWhitelist={["*"]}
                scrollEnabled={false}
                allowsInlineMediaPlayback
                onError={() => setUseFlatMap(true)}
                onHttpError={() => setUseFlatMap(true)}
              />
            )}
          </View>

          <View style={s.privacy}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
            <Text style={s.privacyText}>City-level only. Exact locations are never shared.</Text>
          </View>

          <Text style={[type.sectionTitle, { marginTop: 26, marginBottom: 6 }]}>Everyone</Text>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={s.row}
              onPress={() => setSelectedCity({ city: m.city, memberIds: members.filter((x) => x.city === m.city).map((x) => x.id) })}
              activeOpacity={0.7}
            >
              <Avatar person={m} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                <Text style={type.caption} numberOfLines={1}>
                  {[m.city, m.country].filter(Boolean).join(", ")}
                  {liveLabel(m.locationUpdatedAt, now)}
                </Text>
              </View>
              <Text style={s.rowTime}>{localTime(m.timezone, now)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal visible={selectedCity !== null} transparent animationType="slide" onRequestClose={() => setSelectedCity(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalCity}>{selectedCity?.city}</Text>
                <Text style={type.caption}>
                  {cityMembers.length} {cityMembers.length === 1 ? "person" : "people"} · {localTime(cityMembers[0]?.timezone, now)}
                </Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedCity(null)} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={cityMembers}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <View style={s.row}>
                  <Avatar person={item} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{item.name}</Text>
                    <Text style={type.caption}>{item.relationship}</Text>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 22 },
  globeCard: { height: GLOBE_H, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#E9EEF0" },
  globe: { height: GLOBE_H, backgroundColor: "#E9EEF0" },
  gridH: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  flatPin: { position: "absolute" },
  privacy: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  privacyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowName: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.text },
  rowTime: { fontFamily: fonts.serif, fontSize: 20, color: colors.text },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(35,40,42,0.35)" },
  modalSheet: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingTop: 22, paddingHorizontal: 22, maxHeight: "70%",
  },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  modalCity: { fontFamily: fonts.serif, fontSize: 28, color: colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
});
