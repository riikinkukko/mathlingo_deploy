/**
 * Alert.alert, который работает и в веб-версии приложения: в браузере у
 * react-native-web Alert ничего не показывает, и ошибки «молча» пропадали
 * (кнопка «Добавить ученика» казалась сломанной). На телефоне — обычный Alert.
 */
import { Alert, Platform, type AlertButton } from "react-native";

export function say(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== "cancel" && b.onPress);
  const hasCancel = (buttons ?? []).some((b) => b.style === "cancel");
  if (hasCancel || actions.length > 0 && (buttons?.length ?? 0) > 1) {
    if (window.confirm(text)) actions[0]?.onPress?.();
    return;
  }
  window.alert(text);
  actions[0]?.onPress?.();
}
