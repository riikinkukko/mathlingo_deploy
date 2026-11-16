import { useState } from "react";
import { Image, Modal, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/theme";
import { authedImage } from "@/lib/api";
import { T } from "./ui";

/** Фото страницы сборника — условие задачи репетитора. Тап — на весь экран. */
export default function TaskPhoto({ path, height = 320 }: { path: string; height?: number }) {
  const [open, setOpen] = useState(false);
  const { width, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const src = authedImage(path);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="Открыть фото условия крупно" style={{ borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: "hidden", backgroundColor: C.white }}>
        <Image source={src} style={{ width: "100%", height }} resizeMode="contain" />
        <View style={{ borderTopWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 6 }}>
          <T w="bold" size={12} color={C.inkSoft}>
            Нажми, чтобы открыть крупно
          </T>
        </View>
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <Image source={src} style={{ width, height: screenH - insets.top - insets.bottom - 40 }} resizeMode="contain" />
          <T w="extrabold" size={14} color="#fff" style={{ textAlign: "center", marginTop: 10 }}>
            Закрыть
          </T>
        </Pressable>
      </Modal>
    </>
  );
}
