import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { ComponentProps, useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useMembers } from "../../context/MembersContext";
import { useConnectionAlerts } from "../../lib/connectionAlerts";
import { UserProfile, watchConnections, watchUserProfile } from "../../lib/firestore";
import { useLiveLocation } from "../../lib/liveLocation";
import { colors, fonts, radius } from "../../theme";

// expo-router vendors its own BottomTabBarProps type (not publicly exported) that's
// structurally close to but not identical to @react-navigation/bottom-tabs's own —
// infer it from the Tabs component itself so the two never drift out of sync.
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const HIDDEN_TABS = new Set(["news", "moments"]);

// The inStereo mark: three bars, like a sound level — two channels and the
// sound they make together.
export function LogoMark({ size = 40 }: { size?: number }) {
  const bar = { width: size * 0.09, borderRadius: size, backgroundColor: colors.onPrimary };
  return (
    <View style={[st.logo, { width: size, height: size, borderRadius: size * 0.28, gap: size * 0.09 }]}>
      <View style={[bar, { height: size * 0.3 }]} />
      <View style={[bar, { height: size * 0.5 }]} />
      <View style={[bar, { height: size * 0.3 }]} />
    </View>
  );
}

function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        if (HIDDEN_TABS.has(route.name)) return null;
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? colors.text : colors.textFaint;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={st.tabItem}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
          >
            {options.tabBarIcon?.({ color, size: 23, focused })}
            <Text style={[st.tabLabel, { color, fontFamily: focused ? fonts.sansSemiBold : fonts.sans }]}>
              {options.title ?? route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Header() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    return watchUserProfile(user.uid, setProfile);
  }, [user?.uid]);

  useEffect(() => {
    if (!user) { setRequestCount(0); return; }
    return watchConnections(user.uid, (connections) => {
      setRequestCount(connections.filter((c) => c.status === "pending_label" && !c.labels?.[user.uid]).length);
    });
  }, [user?.uid]);

  return (
    <View style={[st.header, { paddingTop: insets.top + 8 }]}>
      <View style={st.brand}>
        <LogoMark />
        <Text style={st.wordmark}>inStereo</Text>
      </View>

      <View style={st.headerActions}>
        <TouchableOpacity onPress={() => router.push("/settings")} accessibilityLabel="Settings and profile">
          {profile?.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={st.me} />
          ) : (
            <View style={[st.me, st.meEmpty]}>
              <Ionicons name="person" size={16} color={colors.textMuted} />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/connections")}
          style={st.addBtn}
          activeOpacity={0.8}
          accessibilityLabel={requestCount > 0 ? `Add people, ${requestCount} pending requests` : "Add people"}
        >
          <Ionicons name="add" size={26} color={colors.onPrimary} />
          {requestCount > 0 && (
            <View style={st.badge}>
              <Text style={st.badgeText}>{requestCount > 9 ? "9+" : requestCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  const { members } = useMembers();
  // Both run for as long as you're signed in and inside the app.
  useLiveLocation(user?.uid);
  useConnectionAlerts(members);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ header: () => <Header />, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="globe"
        options={{ title: "World", tabBarIcon: ({ color, size }) => <Ionicons name="globe-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: "Chat", tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: "Calendar", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="connect"
        options={{ title: "Pulse", tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen name="news" options={{ href: null } as any} />
      <Tabs.Screen name="moments" options={{ href: null } as any} />
    </Tabs>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { backgroundColor: colors.text, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  wordmark: { fontFamily: fonts.sansBold, fontSize: 22, letterSpacing: -0.6, color: colors.text },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  me: { width: 34, height: 34, borderRadius: 17 },
  meEmpty: { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  addBtn: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  badge: {
    position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.background,
  },
  badgeText: { color: colors.onPrimary, fontSize: 10, fontFamily: fonts.sansBold },
  tabBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", justifyContent: "space-around",
    paddingTop: 10, backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 8,
  },
  tabItem: { alignItems: "center", gap: 4, flex: 1, paddingVertical: 2 },
  tabLabel: { fontSize: 12 },
});
