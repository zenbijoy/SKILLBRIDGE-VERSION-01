import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { createSavedCollection } from "@/features/growth/growthApi";

const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#64748B"];

export default function CreateCollectionScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), "Please enter a collection name.");
      return;
    }
    try {
      setSaving(true);
      await createSavedCollection({
        name: name.trim(),
        description: description.trim() || undefined,
        color: color || "#2563EB",
      });
      router.back();
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message || "Failed to create collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t("saved.createCollection")}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t("saved.name")} *</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Web Development Resources"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Description (Optional)</Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="What is this collection for?"
          placeholderTextColor={colors.textSecondary}
          multiline
        />
      </View>

      {/* Color Picker */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>{t("saved.color")}</Text>
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.colorDot,
                { backgroundColor: c },
                color === c && styles.selectedColorDot,
              ]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary }]}
        onPress={handleSubmit}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{t("saved.createCollection")}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700" },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  textArea: { minHeight: 70, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, fontSize: 14 },
  colorRow: { flexDirection: "row", gap: 10 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  selectedColorDot: { borderWidth: 3, borderColor: "#FFFFFF" },
  submitBtn: { height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 12 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});


