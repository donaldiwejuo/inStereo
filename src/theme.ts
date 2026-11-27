// inStereo design tokens — taken from the Figma designs. Every restyled screen
// should read colors, fonts and spacing from here instead of hard-coding them.

export const colors = {
  background: "#F4F4EF",
  surface: "#FBFBF8", // raised panels (tab bar, inputs)
  primary: "#3F4B43", // dark green: buttons, active states, sent bubbles
  accent: "#556B5E", // muted green: status dots, badges
  text: "#23282A",
  textMuted: "#5F6661", // captions — kept dark enough to read outdoors
  textFaint: "#8A908B",
  border: "#DCDDD6",
  onPrimary: "#FFFFFF",
  warm: "#B4793D", // subtle "may need care" / caution highlight
  danger: "#B4483D",
} as const;

// Card tints, assigned per person so each keeps the same color.
export const cardTints = ["#E9EEF0", "#EDEAF0", "#F1EDE5", "#EBEEE8"] as const; // blue, lavender, sand, sage

export function tintFor(id: number): string {
  return cardTints[Math.abs(id) % cardTints.length];
}

// Font family names registered in src/app/_layout.tsx.
export const fonts = {
  serif: "Newsreader_500Medium", // headings, big clock
  serifRegular: "Newsreader_400Regular",
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
  sansBold: "DMSans_700Bold",
} as const;

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  eyebrow: { fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1.6, color: colors.textFaint },
  display: { fontFamily: fonts.serif, fontSize: 38, letterSpacing: -1, color: colors.text, lineHeight: 44 },
  subtitle: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 23, color: colors.textMuted },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  caption: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
} as const;
