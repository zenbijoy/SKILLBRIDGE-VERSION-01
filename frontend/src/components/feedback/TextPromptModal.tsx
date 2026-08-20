import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Button, Field, H2, Muted } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

export function TextPromptModal({
  visible,
  title,
  detail,
  value,
  onChangeText,
  placeholder,
  submitLabel = "Submit",
  onCancel,
  onSubmit,
  keyboardType = "default",
  multiline = false,
}: {
  visible: boolean;
  title: string;
  detail?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: () => void;
  keyboardType?: "default" | "number-pad" | "url";
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[s.overlay, { backgroundColor: colors.overlay }]} onPress={onCancel}>
        <Pressable style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
          <H2>{title}</H2>
          {detail ? <Muted>{detail}</Muted> : null}
          <Field autoFocus value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} numberOfLines={multiline ? 4 : 1} />
          <View style={s.actions}>
            <Button title="Cancel" variant="ghost" onPress={onCancel} />
            <Button title={submitLabel} onPress={onSubmit} disabled={!value.trim()} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg },
  sheet: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
});
