import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubAchievement, ClubRole } from "../types";
import api from "../../../services/api";

interface ClubAchievementsTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  achievements: ClubAchievement[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const ClubAchievementsTab: React.FC<ClubAchievementsTabProps> = ({
  clubId,
  myRole,
  achievements,
  isLoading,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const isLeader =
    myRole &&
    [
      "owner",
      "admin",
      "president",
      "vice_president",
      "secretary",
      "executive",
    ].includes(myRole);

  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Required Fields", "Please enter achievement title and description.");
      return;
    }
    try {
      setAdding(true);
      await api.post(`/clubs/${clubId}/achievements`, {
        title: title.trim(),
        description: description.trim(),
        date: date.trim() || new Date().toISOString().split("T")[0],
        image_url: imageUrl.trim() || undefined,
        link_url: linkUrl.trim() || undefined,
      });
      Alert.alert("Success", "Achievement added to club showcase! 🏆");
      setShowAddModal(false);
      setTitle("");
      setDescription("");
      setDate("");
      setImageUrl("");
      setLinkUrl("");
      onRefresh();
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to add achievement.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Text style={[styles.heading, { color: colors.text }]}>
          Hall of Fame & Milestones
        </Text>
        {isLeader && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="trophy-outline" size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Award</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>
            Loading achievements...
          </Text>
        </View>
      ) : achievements.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="trophy-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>
            No Achievements Listed Yet
          </Text>
          <Text style={[styles.centerSub, { color: colors.textSecondary }]}>
            When this club wins hackathons, presents research, hosts landmark summits, or
            earns departmental honors, their glory will be showcased here!
          </Text>
          {isLeader && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>Add First Achievement</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={achievements}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.cardImage} />
              ) : null}

              <View style={styles.cardContent}>
                <View style={styles.titleRow}>
                  <View style={styles.trophyIcon}>
                    <Ionicons name="ribbon" size={20} color="#f59e0b" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                      {item.date ? new Date(item.date).toLocaleDateString() : ""}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[styles.cardDesc, { color: colors.textSecondary }]}
                  numberOfLines={4}
                >
                  {item.description}
                </Text>

                {item.link_url && (
                  <TouchableOpacity
                    style={[
                      styles.linkBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    onPress={() => item.link_url && Linking.openURL(item.link_url)}
                  >
                    <Ionicons name="open-outline" size={14} color={colors.primary} />
                    <Text style={[styles.linkBtnText, { color: colors.primary }]}>
                      View Article / Proof
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Add Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Add Club Achievement
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Achievement / Honor Title *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="e.g. 1st Place - National Robotics Championship 2026"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Description & Impact *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  styles.formTextArea,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="Who participated, how many teams competed, what was built..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Date (YYYY-MM-DD)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="2026-09-15"
                placeholderTextColor={colors.textSecondary}
                value={date}
                onChangeText={setDate}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Photo URL (optional)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="https://..."
                placeholderTextColor={colors.textSecondary}
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Press Link / Proof URL (optional)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="https://..."
                placeholderTextColor={colors.textSecondary}
                value={linkUrl}
                onChangeText={setLinkUrl}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleAdd}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Post to Hall of Fame</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  centerSub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: {
    width: "100%",
    height: 160,
    resizeMode: "cover",
  },
  cardContent: {
    padding: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  trophyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  dateText: {
    fontSize: 12,
    marginTop: 2,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  formScroll: {
    paddingBottom: 20,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextArea: {
    height: 70,
    textAlignVertical: "top",
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
