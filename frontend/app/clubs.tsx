import React, { useState, useMemo } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { nextGenAnimations, nextGenAnimationsV2, nextGenBadges } from "@/assets/nextgen";

type ClubItem = {
  id: string;
  name: string;
  description?: string;
  university?: string;
  category?: string;
  verified?: boolean;
  room_id?: string;
  logo_url?: string;
  member_count?: number;
  is_member?: boolean;
  next_event?: {
    id: string;
    title: string;
    starts_at: string;
  };
};

const CATEGORIES = ["All", "Joined", "Academic", "Technical", "Cultural", "Sports"];

export default function ClubsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubCategory, setNewClubCategory] = useState("Academic");
  const [newClubDesc, setNewClubDesc] = useState("");
  const [newClubUni, setNewClubUni] = useState("");

  const clubsQuery = useQuery({
    queryKey: ["clubs"],
    queryFn: () => api<{ clubs: ClubItem[] }>("/clubs"),
  });

  const myClubsQuery = useQuery({
    queryKey: ["my-clubs"],
    queryFn: () => api<{ memberships: { role: string; clubs: ClubItem }[] }>("/clubs/mine"),
  });

  const joinedClubIds = useMemo(() => {
    return new Set((myClubsQuery.data?.memberships ?? []).map((m) => m.clubs?.id).filter(Boolean));
  }, [myClubsQuery.data]);

  const createClubMutation = useMutation({
    mutationFn: () =>
      api<ClubItem>("/clubs", {
        method: "POST",
        body: JSON.stringify({
          name: newClubName.trim(),
          description: newClubDesc.trim() || "Student organization",
          university: newClubUni.trim() || undefined,
        }),
      }),
    onSuccess: (data) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["clubs"] });
      qc.invalidateQueries({ queryKey: ["my-clubs"] });
      setShowCreateModal(false);
      setNewClubName("");
      setNewClubDesc("");
      setNewClubUni("");
      Alert.alert("Club Registered! 🎉", "Your club has been created and linked to Room OS.", [
        {
          text: "Open Club",
          onPress: () => router.push(`/club/${data.id}` as any),
        },
      ]);
    },
    onError: (err: any) => {
      Alert.alert("Registration Failed", err.message || "Could not register club.");
    },
  });

  const allClubs = clubsQuery.data?.clubs ?? [];

  const filteredClubs = useMemo(() => {
    return allClubs.filter((club) => {
      const matchesSearch =
        search.trim().length === 0 ||
        club.name.toLowerCase().includes(search.toLowerCase()) ||
        club.description?.toLowerCase().includes(search.toLowerCase()) ||
        club.university?.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedCategory === "All") return true;
      if (selectedCategory === "Joined") return joinedClubIds.has(club.id);

      const cat = club.category || "Academic";
      return cat.toLowerCase() === selectedCategory.toLowerCase();
    });
  }, [allClubs, search, selectedCategory, joinedClubIds]);

  return (
    <Screen>
      {/* Top Header */}
      <Row style={s.topHeader}>
        <Row style={{ alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View>
            <H1 style={s.pageTitle}>Student Clubs</H1>
            <Muted style={s.pageSubtitle}>Campus societies, debate teams & tech clubs</Muted>
          </View>
        </Row>
        <Button
          title="Create"
          variant="secondary"
          onPress={() => setShowCreateModal(true)}
        />
      </Row>


      {/* Search Input */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <TextInput
          placeholder="Search clubs, societies or topics..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          style={[s.searchInput, { color: colors.text }]}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => {
                triggerHaptic();
                setSelectedCategory(cat);
              }}
              style={[
                s.filterPill,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  s.filterText,
                  { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "700" : "500" },
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Clubs List */}
      {clubsQuery.isLoading ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : clubsQuery.isError ? (
        <ErrorState
          detail={(clubsQuery.error as Error).message}
          onRetry={() => clubsQuery.refetch()}
        />
      ) : filteredClubs.length === 0 ? (
        <Empty
          icon="account-group"
          title="No Clubs Found"
          detail={search ? "Try adjusting your search terms or category filter." : "Be the first to create a student club on campus!"}
        />
      ) : (
        <View style={s.clubList}>
          {filteredClubs.map((club) => {
            const isJoined = joinedClubIds.has(club.id);
            return (
              <Pressable
                key={club.id}
                onPress={() => {
                  triggerHaptic();
                  router.push(`/club/${club.id}` as any);
                }}
                style={({ pressed }) => [
                  s.clubRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {/* Club Icon Avatar */}
                <View style={[s.clubAvatar, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="account-group" size={24} color={colors.primary} />
                </View>

                {/* Club Info */}
                <View style={s.clubInfo}>
                  <Row style={{ alignItems: "center", gap: 6 }}>
                    <Text style={[s.clubName, { color: colors.text }]} numberOfLines={1}>
                      {club.name}
                    </Text>
                    {club.verified ? (
                      <Image
                        source={nextGenBadges.verifiedClub}
                        style={{ width: 16, height: 16 }}
                        resizeMode="contain"
                      />
                    ) : null}
                  </Row>
                  <Text style={[s.clubCategory, { color: colors.muted }]} numberOfLines={1}>
                    {club.category || "Academic Society"} · {club.university || "Campus Wide"}
                  </Text>
                  {club.description ? (
                    <Text style={[s.clubDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                      {club.description}
                    </Text>
                  ) : null}
                </View>

                {/* Action CTA */}
                <View style={s.clubAction}>
                  <Pill tone={isJoined ? "accent" : "default"}>
                    {isJoined ? "Joined" : "View"}
                  </Pill>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Create Club Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={s.modalHeader}>
              <H2>Register New Club</H2>
              <Pressable onPress={() => setShowCreateModal(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </Row>
            <Muted style={{ marginBottom: 14 }}>
              Registered clubs receive a persistent Room OS collaboration space, event conflict detection, and community channels.
            </Muted>

            <View style={{ gap: 12 }}>
              <View>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Club Name</Text>
                <TextInput
                  placeholder="e.g. Robotics & AI Club"
                  placeholderTextColor={colors.muted}
                  value={newClubName}
                  onChangeText={setNewClubName}
                  style={[s.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                />
              </View>

              <View>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Category</Text>
                <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {["Academic", "Technical", "Cultural", "Sports"].map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setNewClubCategory(cat)}
                      style={[
                        s.categoryOption,
                        {
                          backgroundColor: newClubCategory === cat ? colors.primary : colors.bg,
                          borderColor: newClubCategory === cat ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: newClubCategory === cat ? "#FFF" : colors.text, fontSize: 12, fontWeight: "600" }}>
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </Row>
              </View>

              <View>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Description & Mission</Text>
                <TextInput
                  placeholder="What is your club's primary purpose and activities?"
                  placeholderTextColor={colors.muted}
                  value={newClubDesc}
                  onChangeText={setNewClubDesc}
                  multiline
                  numberOfLines={3}
                  style={[s.modalInput, { height: 75, backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                />
              </View>

              <View>
                <Text style={[s.fieldLabel, { color: colors.text }]}>University (Optional)</Text>
                <TextInput
                  placeholder="e.g. Dhaka University"
                  placeholderTextColor={colors.muted}
                  value={newClubUni}
                  onChangeText={setNewClubUni}
                  style={[s.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </View>

            <Row style={{ gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setShowCreateModal(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={createClubMutation.isPending ? "Creating..." : "Create Club"}
                  disabled={createClubMutation.isPending || newClubName.trim().length < 3}
                  onPress={() => createClubMutation.mutate()}
                />
              </View>
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  topHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backBtn: {
    padding: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  pageSubtitle: {
    fontSize: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filterScroll: {
    maxHeight: 40,
    marginBottom: 12,
  },
  filterContent: {
    gap: 8,
    alignItems: "center",
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
  },
  clubList: {
    gap: 8,
  },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  clubAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  clubInfo: {
    flex: 1,
    gap: 2,
  },
  clubName: {
    fontSize: 15,
    fontWeight: "700",
  },
  clubCategory: {
    fontSize: 12,
  },
  clubDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  clubAction: {
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 16,
  },
  modalContent: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  modalInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
