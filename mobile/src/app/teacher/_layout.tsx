import { Stack } from "expo-router";
import { C } from "@/theme";

/** Кабинет репетитора: вкладки + экраны второго уровня. */
export default function TeacherLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper }, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lesson-new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="payment-new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="student-new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="log-new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="group-edit" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
