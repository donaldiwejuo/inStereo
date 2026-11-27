import { Ionicons } from "@expo/vector-icons";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../config/firebase";

import { colors, fonts } from "../../theme";
export default function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Alert.alert() is a silent no-op on react-native-web, so errors here are
  // shown inline instead — that works identically on every platform.
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const e = email.trim().toLowerCase();
    const p = password;
    if (!e || !p) {
      setError("Enter your email and password.");
      return;
    }
    if (p.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, e, p);
      } else {
        await signInWithEmailAndPassword(auth, e, p);
      }
      // AuthContext picks up the new user → root layout redirects automatically
    } catch (err: any) {
      const msg =
        err.code === "auth/user-not-found" || err.code === "auth/wrong-password"
          ? "Incorrect email or password."
          : err.code === "auth/email-already-in-use"
            ? "An account with this email already exists."
            : err.code === "auth/invalid-email"
              ? "Enter a valid email address."
              : "Something went wrong: " + (err.code ?? err.message);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" />

      <View style={s.top}>
        <Text style={s.wordmark}>inStereo</Text>
        <Text style={s.tagline}>Stay close, no matter the distance.</Text>
      </View>

      <View style={s.card}>
        <View style={s.toggle}>
          <TouchableOpacity
            style={[s.toggleBtn, mode === "signin" && s.toggleActive]}
            onPress={() => { setMode("signin"); setError(null); }}
          >
            <Text style={[s.toggleTxt, mode === "signin" && s.toggleTxtActive]}>
              Sign in
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, mode === "signup" && s.toggleActive]}
            onPress={() => { setMode("signup"); setError(null); }}
          >
            <Text style={[s.toggleTxt, mode === "signup" && s.toggleTxtActive]}>
              Create account
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={s.errorTxt}>{error}</Text> : null}

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={s.label}>Password</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <Pressable style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        <TouchableOpacity
          style={[s.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={s.submitTxt}>
              {mode === "signup" ? "Create account" : "Sign in"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={s.footer}>
        By continuing you agree to inStereo's Terms & Privacy Policy.
      </Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  top: { alignItems: "center", marginBottom: 40 },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 46,
    color: colors.text,
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    color: colors.textMuted,
    fontFamily: fonts.sans, fontSize: 14,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 3,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  toggleActive: { backgroundColor: colors.primary },
  toggleTxt: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.sansSemiBold },
  toggleTxtActive: { color: colors.onPrimary },
  errorTxt: {
    color: colors.danger,
    fontFamily: fonts.sans, fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sansSemiBold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    color: colors.text,
    fontFamily: fonts.sans, fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  eyeBtn: { padding: 8 },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitTxt: { color: colors.onPrimary, fontSize: 16, fontFamily: fonts.sansBold },
  footer: {
    color: colors.textFaint,
    fontFamily: fonts.sans, fontSize: 11,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 16,
  },
});
