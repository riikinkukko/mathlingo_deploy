import { forwardRef, type ComponentRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Image, PanResponder, View, type ImageSourcePropType } from "react-native";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { C } from "@/theme";

export type MarkupHandle = { capture: () => Promise<string | null>; undo: () => void; clear: () => void; count: number };

/**
 * Фото решения с пометками репетитора (красная ручка). capture() — JPEG
 * data URL с пометками (как «Пометки» на сайте), null — пометок нет.
 */
export const PhotoMarkup = forwardRef<MarkupHandle, { source: { uri: string; headers?: Record<string, string> }; width: number; drawing: boolean; onChange?: (n: number) => void }>(
  function PhotoMarkup({ source, width, drawing, onChange }, ref) {
    const [ratio, setRatio] = useState(4 / 3);
    const [paths, setPaths] = useState<string[]>([]);
    const cur = useRef<string>("");
    const [, tick] = useState(0);
    const view = useRef<ComponentRef<typeof View>>(null);
    const drawingRef = useRef(drawing);
    drawingRef.current = drawing;

    useEffect(() => {
      const ok = (w: number, h: number) => w && h && setRatio(h / w);
      if (source.headers) Image.getSizeWithHeaders(source.uri, source.headers, ok, () => {});
      else Image.getSize(source.uri, ok, () => {});
    }, [source.uri, source.headers]);
    useEffect(() => onChange?.(paths.length), [paths.length, onChange]);

    const pan = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => drawingRef.current,
        onMoveShouldSetPanResponder: () => drawingRef.current,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          cur.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
          tick((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          cur.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          tick((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const p = cur.current;
          cur.current = "";
          if (p.includes("L")) setPaths((ps) => [...ps, p]);
          else tick((n) => n + 1);
        },
      })
    ).current;
    useImperativeHandle(
      ref,
      () => ({
        count: paths.length,
        undo: () => setPaths((ps) => ps.slice(0, -1)),
        clear: () => setPaths([]),
        capture: async () => {
          if (!paths.length || !view.current) return null;
          return captureRef(view, { format: "jpg", quality: 0.7, result: "data-uri", width: Math.min(1000, Math.round(width * 2)) }).catch(() => null);
        },
      }),
      [paths, width]
    );

    const h = Math.round(width * ratio);
    return (
      <View ref={view} collapsable={false} style={{ width, height: h, backgroundColor: C.white }} {...pan.panHandlers}>
        <Image source={source as ImageSourcePropType} style={{ width, height: h }} resizeMode="contain" />
        <Svg width={width} height={h} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
          {[...paths, cur.current].filter(Boolean).map((d, i) => (
            <Path key={i} d={d} stroke={C.coral} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
    );
  }
);
