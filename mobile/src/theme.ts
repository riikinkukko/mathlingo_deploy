/** Цвета и шрифты приложения — те же, что у сайта (tailwind.config.ts). */
export const C = {
  paper: "#F2FAF5",
  white: "#FFFFFF",
  ink: "#132A20",
  inkSoft: "#5C7A6C",
  pine: "#1CAE6B",
  pineStrong: "#12804F",
  pineLight: "#E1F6EA",
  pineDark: "#12583A",
  pineDarker: "#0C3D28",
  pineMint: "#8FD9B4",
  amber: "#F0A93C",
  amberLight: "#FCEFD8",
  amberText: "#B4761F",
  coral: "#F0555A",
  coralLight: "#FCE4E4",
  coralText: "#C93B40",
  violet: "#8B6BE0",
  violetLight: "#EEE8FC",
  violetText: "#6C4FC4",
  teal: "#16B3A6",
  tealLight: "#DDF6F3",
  line: "#D7EAE0",
  lineSoft: "#E4F0E9",
  grid: "#DCEEE3",
} as const;

export const F = {
  regular: "Nunito_400Regular",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extrabold: "Nunito_800ExtraBold",
  black: "Nunito_900Black",
} as const;

export const R = { card: 20, pill: 999, input: 16 } as const;

export const shadow = {
  shadowColor: "#132A20",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;
