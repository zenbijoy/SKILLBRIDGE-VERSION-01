import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Muted } from "@/components/ui";
import { radius, useTheme } from "@/theme";

export function SettingsRow({
  icon,
  title,
  detail,
  onPress,
  value,
  danger = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  detail?: string;
  onPress?: () => void;
  value?: string;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}
    >
      <View style={[s.icon, { backgroundColor: danger ? `${colors.danger}12` : colors.primarySoft }]}>
        <MaterialCommunityIcons name={icon} size={21} color={danger ? colors.danger : colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.title, { color: danger ? colors.danger : colors.text }]}>{title}</Text>
        {detail ? <Muted numberOfLines={2}>{detail}</Muted> : null}
      </View>
      {value ? <Text style={{ color: colors.muted, fontSize: 13 }}>{value}</Text> : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 68, borderWidth: 1, borderRadius: radius.lg, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800" },
});
