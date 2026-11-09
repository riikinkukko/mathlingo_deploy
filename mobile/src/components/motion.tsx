import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { C } from "@/theme";

/**
 * Анимации приложения — на Reanimated (UI-поток, не тормозят при загрузке).
 * Правило: движение отвечает на действие (нажатие, верный ответ, пройденный
 * урок) или появление нового; бесконечно двигается только то, что зовёт
 * к действию (текущий урок на пути).
 */

/** Появление снизу с затуханием; i — порядковый номер для «лесенки». */
export const enter = (i = 0, base = 0) =>
  FadeInDown.duration(360)
    .delay(base + Math.min(i, 10) * 45)
    .springify()
    .damping(18)
    .stiffness(170);

/** Пружинящее нажатие: элемент чуть сжимается под пальцем. */
export function PressScale({
  children,
  style,
  scaleTo = 0.95,
  ...rest
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        s.value = withSpring(scaleTo, { damping: 15, stiffness: 400 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 10, stiffness: 260 });
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Мягкая «волна» вокруг элемента — для текущего урока на пути. */
export function PulseRing({ size, color = C.pine }: { size: number; color?: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [p]);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.45, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [1, 1.45]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color }, a]}
    />
  );
}

/** Лёгкое покачивание вверх-вниз (маскот «дышит»). */
export function Bob({ children, amp = 4, duration = 1800, style }: { children: ReactNode; amp?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [p, duration]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(p.value, [0, 1], [0, -amp]) }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Появление с отскоком (значок, маскот, иконка награды). */
export function Pop({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(0.3);
  const o = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(delay, withSpring(1, { damping: 9, stiffness: 180 }));
    o.value = withDelay(delay, withTiming(1, { duration: 180 }));
  }, [s, o, delay]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Покачивание по команде: меняется trigger — элемент «вздрагивает». */
export function Wiggle({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withSequence(
      withTiming(-12, { duration: 70 }),
      withTiming(10, { duration: 90 }),
      withTiming(-6, { duration: 80 }),
      withSpring(0, { damping: 6 })
    );
  }, [trigger, r]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Полоса прогресса, которая плавно доезжает до нового значения. */
export function AnimatedBar({ pct, color = C.pine, track = C.grid, height = 8, delay = 0 }: { pct: number; color?: string; track?: string; height?: number; delay?: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(Math.max(0, Math.min(100, pct)), { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [pct, v, delay]);
  const a = useAnimatedStyle(() => ({ width: `${v.value}%` }));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", backgroundColor: color, borderRadius: height }, a]} />
    </View>
  );
}

/** Число, которое «набегает» от 0 до value (опыт за урок, баллы). */
export function useCountUp(value: number, duration = 900, delay = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const t0 = setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const k = Math.min(1, (t - start) / duration);
        setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(t0);
      cancelAnimationFrame(raf);
    };
  }, [value, duration, delay]);
  return n;
}

// ------------------------------------------------------------ конфетти

const CONFETTI_COLORS = ["#1CAE6B", "#FFC83D", "#FF7A59", "#7C6CF2", "#2F9BFF", "#12804F"];

type Piece = { vx: number; vy: number; rot: number; color: string; w: number; h: number; delay: number };

function ConfettiPiece({ p, progress, originX, originY }: { p: Piece; progress: SharedValue<number>; originX: number; originY: number }) {
  const a = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t < 0.75 ? 1 : interpolate(t, [0.75, 1], [1, 0]),
      transform: [
        { translateX: originX + p.vx * t },
        { translateY: originY + p.vy * t + 520 * t * t },
        { rotate: `${p.rot * t}deg` },
      ],
    };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color }, a]} />;
}

/**
 * Хлопушка конфетти из точки (x, y) внутри родителя. Меняется burst —
 * хлопает снова. Не перехватывает касания.
 */
export function Confetti({ burst, x, y, count = 28 }: { burst: number; x: number; y: number; count?: number }) {
  const progress = useSharedValue(0);
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
        const sp = 260 + Math.random() * 260;
        return {
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          rot: (Math.random() - 0.5) * 900,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          w: 6 + Math.random() * 5,
          h: 9 + Math.random() * 7,
          delay: 0,
        };
      }),
    // новые траектории на каждый хлопок
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst, count]
  );
  useEffect(() => {
    if (!burst) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) });
  }, [burst, progress]);
  if (!burst) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "visible", zIndex: 50 }}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={`${burst}-${i}`} p={p} progress={progress} originX={x} originY={y} />
      ))}
    </View>
  );
}
