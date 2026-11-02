import { TextInput, View, type TextInputProps } from "react-native";
import { C, F, R } from "@/theme";
import { T } from "./ui";

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T w="extrabold" size={13} color={C.inkSoft}>
        {label}
      </T>
      <TextInput
        placeholderTextColor="#9DB5A8"
        {...props}
        style={[
          {
            borderWidth: 2,
            borderColor: C.line,
            borderRadius: R.input,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: F.semibold,
            fontSize: 16,
            color: C.ink,
            backgroundColor: C.white,
          },
          props.style,
        ]}
      />
    </View>
  );
}
