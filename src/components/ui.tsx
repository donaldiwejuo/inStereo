// Shared building blocks for the Figma design, so every tab looks the same.
import { ReactNode } from "react";
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { Member } from "../context/MembersContext";
import { colors, fonts, radius, type } from "../theme";

// "MESSAGES / Stay in touch. / optional subtitle" page heading.
export function ScreenHeading({ eyebrow, title, subtitle, right }: {
  eyebrow: string; title: string; subtitle?: string; right?: ReactNode;
}) {
  return (
    <View style={ui.heading}>
      <View style={{ flex: 1 }}>
        <Text style={type.eyebrow}>{eyebrow.toUpperCase()}</Text>
        <Text style={[type.display, { marginTop: 8 }]}>{title}</Text>
        {subtitle ? <Text style={[type.subtitle, { marginTop: 10 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

type AvatarPerson = Pick<Member, "name" | "photoUri">;

export function Avatar({ person, size = 44, ring = false }: { person: AvatarPerson; size?: number; ring?: boolean }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  const inner = person.photoUri ? (
    <Image source={{ uri: person.photoUri }} style={style} />
  ) : (
    <View style={[style, ui.avatarEmpty]}>
      <Text style={[ui.avatarInitial, { fontSize: size * 0.4 }]}>{person.name?.[0]?.toUpperCase() ?? "?"}</Text>
    </View>
  );
  if (!ring) return inner;
  return <View style={[ui.ring, { borderRadius: size / 2 + 3 }]}>{inner}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export const ui = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 22, paddingTop: 28, paddingBottom: 20 },
  avatarEmpty: { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontFamily: fonts.serif, color: colors.text },
  ring: { padding: 3, backgroundColor: colors.onPrimary },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
});
