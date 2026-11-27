import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, fonts } from "../theme";
const FEATURES = [
  "Real-time local time for each person in your life",
  "Live weather where they are",
  "Country-specific news and safety alerts",
  "Birthday and anniversary reminders",
  "Interactive globe showing where everyone is",
  "Push notifications for events that matter",
];

export default function AboutScreen() {
  const router = useRouter();

  return (
    <View style={a.root}>
      <StatusBar barStyle="dark-content" />
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'About',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.border,
        }}
      />
      <ScrollView
        contentContainerStyle={a.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={a.hero}>
          <Text style={[a.heroTitle, { fontFamily: fonts.serif }]}>inStereo</Text>
          <Text style={a.heroSlogan}>everyone, everywhere, all together</Text>
        </View>

        {/* Our Mission */}
        <View style={a.card}>
          <Text style={a.sectionTitle}>Our Mission</Text>
          <Text style={a.body}>
            inStereo bridges the distance between you and the people you love. Built for a world where families are spread across cities, time zones, and continents — we make staying close feel effortless. No mental math, no scattered apps. Just your people, at a glance.
          </Text>
        </View>

        {/* What inStereo Can Do */}
        <View style={a.card}>
          <Text style={a.sectionTitle}>What inStereo Can Do</Text>
          {FEATURES.map((feature, i) => (
            <View key={i} style={a.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginTop: 2 }} />
              <Text style={a.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Countries We Support */}
        <View style={a.card}>
          <Text style={a.sectionTitle}>Countries We Support</Text>
          <Text style={a.body}>
            inStereo supports locations in over 180 countries — from the United States and United Kingdom to India, Nigeria, Brazil, Japan, and everywhere in between. Our news coverage spans major regions worldwide with local context for each.
          </Text>
        </View>

        {/* A Note From the Founder */}
        <View style={a.card}>
          <Text style={a.sectionTitle}>A Note From the Founder</Text>
          <Text style={a.quote}>
            Distance is a fact. Disconnection is a choice. inStereo was built because staying close to family should not require effort — it should be as natural as looking at your phone. We built this for every student studying abroad, every immigrant starting over, every parent watching their child move across the world. You are not alone.
          </Text>
        </View>

        {/* Footer */}
        <View style={a.footer}>
          <Text style={a.footerText}>inStereo · v0.1 · Made with care</Text>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const a = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, gap: 16 },
  hero: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  heroTitle: {
    fontFamily: fonts.sans, fontSize: 56,
    color: colors.text,
    letterSpacing: 0,
  },
  heroSlogan: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: fonts.sansBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  body: {
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 15,
    lineHeight: 24,
  },
  quote: {
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  featureText: {
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    color: colors.textFaint,
    fontFamily: fonts.sans, fontSize: 12,
    letterSpacing: 0.5,
  },
});
