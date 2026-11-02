import { memo } from "react";
import { View, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { ICONS, MASCOT, type IconName, type MascotMood } from "@/assets/svg";
import { C } from "@/theme";

export const Icon = memo(function Icon({ name, size = 22, color = C.ink }: { name: IconName; size?: number; color?: string }) {
  return <SvgXml xml={ICONS[name]} width={size} height={size} color={color} />;
});

export const Mascot = memo(function Mascot({ mood = "idle", size = 96 }: { mood?: MascotMood; size?: number }) {
  return <SvgXml xml={MASCOT[mood]} width={size} height={(size * 132) / 120} />;
});

function viewBoxRatio(svg: string): number {
  const m = /viewBox="([\d.\s-]+)"/.exec(svg);
  if (!m) return 2 / 3;
  const [, , w, h] = m[1].trim().split(/\s+/).map(Number);
  return w > 0 && h > 0 ? h / w : 2 / 3;
}

/** Чертёж задачи (SVG с сервера): по ширине контейнера, с пропорциями viewBox. */
export const Diagram = memo(function Diagram({ svg, maxHeight = 260, style }: { svg: string; maxHeight?: number; style?: ViewStyle }) {
  const ratio = viewBoxRatio(svg);
  return (
    <View
      style={[
        { backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.lineSoft, padding: 8, alignItems: "center" },
        style,
      ]}
    >
      <View style={{ width: "100%", maxWidth: maxHeight / ratio, aspectRatio: 1 / ratio }}>
        <SvgXml xml={svg} width="100%" height="100%" />
      </View>
    </View>
  );
});
