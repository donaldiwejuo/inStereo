import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { updateUserProfile } from "../../lib/firestore";

import { colors, fonts } from "../../theme";
const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "NG", name: "Nigeria" }, { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" }, { code: "IN", name: "India" },
  { code: "GH", name: "Ghana" }, { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" }, { code: "FR", name: "France" },
  { code: "DE", name: "Germany" }, { code: "JP", name: "Japan" },
  { code: "CN", name: "China" }, { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" }, { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" }, { code: "PK", name: "Pakistan" },
  { code: "ET", name: "Ethiopia" }, { code: "EG", name: "Egypt" },
  { code: "TR", name: "Turkey" }, { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates" }, { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" }, { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" }, { code: "KR", name: "South Korea" },
  { code: "NZ", name: "New Zealand" }, { code: "IE", name: "Ireland" },
  { code: "SE", name: "Sweden" }, { code: "NL", name: "Netherlands" },
  { code: "NE", name: "Niger" }, { code: "CM", name: "Cameroon" },
  { code: "TZ", name: "Tanzania" }, { code: "UG", name: "Uganda" },
  { code: "RW", name: "Rwanda" }, { code: "CI", name: "Ivory Coast" },
  { code: "SN", name: "Senegal" }, { code: "CD", name: "DR Congo" },
];

export default function OnboardingLocation() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  ).slice(0, 6);

  async function handleFinish() {
    if (!name.trim()) { Alert.alert("Name required", "Enter your name."); return; }
    if (!city.trim()) { Alert.alert("City required", "Enter your city."); return; }
    if (!selectedCountry) { Alert.alert("Country required", "Select your country."); return; }
    if (!user) return;
    setLoading(true);
    try {
      let lat = 0;
      let lon = 0;
      let region = "";
      let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=5&language=en&format=json`
        );
        const geoData = await geoRes.json();
        const results = geoData?.results ?? [];
        const match = results.find(
          (r: any) => r.country_code?.toUpperCase() === selectedCountry.code
        ) ?? results[0];
        if (match) {
          lat = match.latitude ?? 0;
          lon = match.longitude ?? 0;
          region = match.admin1 ?? "";
          if (match.timezone) timezone = match.timezone;
        }
      } catch {
        // geocoding failed — fall back to 0,0 and device timezone
      }

      await updateUserProfile(user.uid, {
        name: name.trim(),
        city: city.trim(),
        region,
        country: selectedCountry.name,
        countryCode: selectedCountry.code,
        timezone,
        lat,
        lon,
        wakeHour: 7,
        sleepHour: 22,
        onboardingComplete: true,
      });
      // AuthGate watches the profile via onSnapshot and navigates to /tabs automatically
    } catch {
      Alert.alert("Error", "Could not save your info. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.progress}>
          <View style={[s.dot, s.dotDone]} />
          <View style={[s.dot, s.dotActive]} />
          <View style={s.dot} />
        </View>

        <Text style={s.heading}>Set up your profile</Text>
        <Text style={s.sub}>Your name and location help your connections see who you are and where you are in the world.</Text>

        <Text style={s.label}>Your name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Donald"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={s.label}>City</Text>
        <TextInput
          style={s.input}
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Durham"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={s.label}>Country</Text>
        {selectedCountry ? (
          <TouchableOpacity
            style={s.selectedCountry}
            onPress={() => { setSelectedCountry(null); setCountrySearch(""); }}
          >
            <Text style={s.selectedCountryTxt}>{selectedCountry.name}</Text>
            <Text style={s.changeTxt}>Change</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              style={s.input}
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search country…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="words"
            />
            {countrySearch.length > 0 && (
              <View style={s.dropdown}>
                {filtered.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={s.dropdownItem}
                    onPress={() => { setSelectedCountry(c); setCountrySearch(""); }}
                  >
                    <Text style={s.dropdownTxt}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
                {filtered.length === 0 && (
                  <Text style={s.dropdownEmpty}>No results</Text>
                )}
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={[s.btn, loading && { opacity: 0.6 }, { marginTop: 32, marginBottom: 48 }]}
          onPress={handleFinish}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={s.btnTxt}>Finish setup</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28, paddingTop: 80 },
  progress: { flexDirection: "row", gap: 6, marginBottom: 48 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  dotDone: { backgroundColor: colors.primary },
  heading: { color: colors.text, fontSize: 30, fontFamily: fonts.sansBold, marginBottom: 8 },
  sub: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 15, marginBottom: 36, lineHeight: 22 },
  label: {
    color: colors.textMuted, fontSize: 11, fontFamily: fonts.sansSemiBold,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginTop: 12,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: 14,
    color: colors.text, fontFamily: fonts.sans, fontSize: 16,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  dropdown: {
    backgroundColor: colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 4, overflow: "hidden",
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownTxt: { color: colors.text, fontFamily: fonts.sans, fontSize: 15 },
  dropdownEmpty: { color: colors.textFaint, padding: 16, textAlign: "center" },
  selectedCountry: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#E3E8E3", borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: 4,
    borderWidth: 1, borderColor: colors.accent,
  },
  selectedCountryTxt: { color: colors.text, fontSize: 16, fontFamily: fonts.sansSemiBold },
  changeTxt: { color: colors.primary, fontFamily: fonts.sans, fontSize: 13 },
  btn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  btnTxt: { color: colors.onPrimary, fontSize: 16, fontFamily: fonts.sansBold },
});
