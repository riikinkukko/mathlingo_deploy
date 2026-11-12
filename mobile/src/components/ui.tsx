import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { C, F, R, shadow } from "@/theme";
import Reanimated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Icon, Mascot } from "./Svg";
import { AnimatedBar, PressScale } from "./motion";
import type { MascotMood } from "@/assets/svg";

type Weight = keyof typeof F;

export function T({
  w = "regular",
  size = 15,
  color = C.ink,
  style,
  ...rest
}: TextProps & { w?: Weight; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[{ fontFamily: F[w], fontSize: size, color, lineHeight: Math.round(size * 1.38) }, style]} />;
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <T w="black" size={26} style={[{ letterSpacing: -0.3, lineHeight: 31 }, style]}>
      {children}
    </T>
  );
}

export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <T w="black" size={18} style={[{ lineHeight: 23 }, style]}>
      {children}
    </T>
  );
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "light";

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = { primary: C.pineStrong, secondary: C.white, ghost: "transparent", danger: C.coral, light: C.white }[kind];
  const fg = { primary: C.white, secondary: C.inkSoft, ghost: C.pineStrong, danger: C.white, light: C.pineDark }[kind];
  const border = kind === "secondary" ? C.line : "transparent";
  const sc = useSharedValue(1);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  const raised = kind === "primary" && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPressIn={() => (sc.value = withSpring(0.96, { damping: 15, stiffness: 420 }))}
      onPressOut={() => (sc.value = withSpring(1, { damping: 9, stiffness: 260 }))}
      onPress={() => {
        if (kind === "primary") Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={style}
    >
      {({ pressed }) => (
        <Reanimated.View
          style={[
            {
              minHeight: small ? 40 : 52,
              paddingHorizontal: small ? 14 : 20,
              borderRadius: R.pill,
              backgroundColor: bg,
              borderWidth: 2,
              borderColor: border,
              alignItems: "center",
              justifyContent: "center",
              opacity: disabled ? 0.45 : 1,
            },
            raised ? { borderBottomWidth: pressed ? 2 : 4, borderBottomColor: "rgba(0,0,0,0.16)", marginTop: pressed ? 2 : 0 } : null,
            lift,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={fg} />
          ) : (
            <T w="extrabold" size={small ? 13 : 15} color={fg} style={{ letterSpacing: 0.3, textTransform: "uppercase" }}>
              {title}
            </T>
          )}
        </Reanimated.View>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = [{ backgroundColor: C.white, borderRadius: R.card, borderWidth: 1, borderColor: C.lineSoft, padding: 16 }, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <PressScale onPress={onPress} scaleTo={0.97} style={body}>
      {children}
    </PressScale>
  );
}

export function ProgressBar({ pct, color = C.pine, track = C.grid, height = 8 }: { pct: number; color?: string; track?: string; height?: number }) {
  return <AnimatedBar pct={pct} color={color} track={track} height={height} />;
}

export function Pill({ text, bg = C.pineLight, color = C.pineDark, style }: { text: string; bg?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: bg, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }, style]}>
      <T w="extrabold" size={12} color={color}>
        {text}
      </T>
    </View>
  );
}

/** Экран с прокруткой, отступами под вырез и «потяни, чтобы обновить». */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  header,
  contentStyle,
  scroll = true,
  scrollEnabled = true,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  /** false — прокрутка временно выключена (например, пока рисуют по фото) */
  scrollEnabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const inner = [{ padding: 16, paddingBottom: 32, gap: 14 }, contentStyle];
  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: header ? 0 : insets.top }}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          scrollEnabled={scrollEnabled}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.pine} colors={[C.pine]} /> : undefined}
        >
          <Reanimated.View entering={FadeIn.duration(260)} style={{ gap: 14 }}>
            {children}
          </Reanimated.View>
        </ScrollView>
      ) : (
        <Reanimated.View entering={FadeIn.duration(260)} style={[{ flex: 1 }, inner]}>
          {children}
        </Reanimated.View>
      )}
    </View>
  );
}

/** Шапка экрана второго уровня: «назад», заголовок, действие справа. */
export function Header({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 6,
        paddingBottom: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: C.white,
        borderBottomWidth: 1,
        borderBottomColor: C.lineSoft,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Назад"
        hitSlop={10}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
      >
        <T w="black" size={18} color={C.inkSoft}>
          ←
        </T>
      </Pressable>
      <View style={{ flex: 1 }}>
        <T w="black" size={17} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T w="bold" size={12} color={C.inkSoft} numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Loading({ label = "Загружаем…" }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: C.paper, padding: 24 }}>
      <ActivityIndicator size="large" color={C.pine} />
      <T color={C.inkSoft}>{label}</T>
    </View>
  );
}

export function Empty({
  mood = "idle",
  title,
  text,
  action,
}: {
  mood?: MascotMood;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
      <Mascot mood={mood} size={84} />
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      {text ? (
        <T color={C.inkSoft} style={{ textAlign: "center" }}>
          {text}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 8, alignSelf: "stretch" }}>{action}</View> : null}
    </Card>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
      <Mascot mood="worried" size={72} />
      <T w="bold" style={{ textAlign: "center" }}>
        {message}
      </T>
      {onRetry ? <Button title="Повторить" kind="secondary" onPress={onRetry} small /> : null}
    </Card>
  );
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function StatBadge({ icon, value, color }: { icon: "Flame" | "Bolt" | "Star"; value: string; color: string }) {
  return (
    <Row gap={4} style={{ backgroundColor: C.white, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.lineSoft, ...shadow, shadowOpacity: 0.04 }}>
      <Icon name={icon} size={16} color={color} />
      <T w="black" size={14}>
        {value}
      </T>
    </Row>
  );
}
