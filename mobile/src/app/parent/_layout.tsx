import { Stack } from "expo-router";
import { C } from "@/theme";

export default function ParentLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper }, animation: "slide_from_right" }} />;
}
