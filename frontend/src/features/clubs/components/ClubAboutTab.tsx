import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubDetail } from "../types";

interface ClubAboutTabProps {
  club: ClubDetail;
}

export const ClubAboutTab: React.FC<ClubAboutTabProps> = ({ club }) => {
  const { colors } = useTheme();

  const handleOpenLink = (url?: string) => {
    if (url) {
      Linking.openURL(url).catch((_err: unknown) => {
        Alert.alert("Link Error", "Could not open link in browser.");
      });
    }
  };

  const socialLinks = club.social_links || {};
  const hasSocials = Object.keys(socialLinks).length > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Mission & Vision Cards */}
      {(club.mission || club.vision) && (
        <View style={styles.sectionWrap}>
          {club.mission && (
            <View
              style={[
                styles.quoteCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderLeftColor: colors.primary,
                },
              ]}
            >
              <View style={styles.quoteHeader}>
                <Ionicons name="flag" size={18} color={colors.primary} />
                <Text style={[styles.quoteTitle, { color: colors.text }]}>
                  Our Mission
                </Text>
              </View>
              <Text style={[styles.quoteText, { color: colors.textSecondary }]}>
                {club.mission}
              </Text>
            </View>
          )}

          {club.vision && (
            <View
              style={[
                styles.quoteCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderLeftColor: "#10b981",
                },
              ]}
            >
              <View style={styles.quoteHeader}>
                <Ionicons name="telescope" size={18} color="#10b981" />
                <Text style={[styles.quoteTitle, { color: colors.text }]}>
                  Our Vision
                </Text>
              </View>
              <Text style={[styles.quoteText, { color: colors.textSecondary }]}>
                {club.vision}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Description / Summary */}
      {club.description && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            About {club.name}
          </Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {club.description}
          </Text>
        </View>
      )}

      {/* Activities Summary */}
      {club.activities_summary && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Activities & Initiatives
          </Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {club.activities_summary}
          </Text>
        </View>
      )}

      {/* Key Information Grid */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Club Profile Information
        </Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Ionicons name="school-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                University
              </Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {club.university || "University Campus"}
              </Text>
            </View>
          </View>

          {club.department && (
            <View style={styles.infoItem}>
              <Ionicons
                name="business-outline"
                size={18}
                color={colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  Affiliated Department
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {club.department}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.infoItem}>
            <Ionicons
              name="calendar-clear-outline"
              size={18}
              color={colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                Founded Year
              </Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {club.founded_year || "Est. 2024"}
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                Category
              </Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {club.category || "General"}
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <Ionicons
              name="lock-open-outline"
              size={18}
              color={colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                Membership Policy
              </Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {club.membership_type === "open"
                  ? "Open (Instant Join)"
                  : club.membership_type === "application"
                  ? "Application / Screening Required"
                  : "Invite Only"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Official Contacts & Links */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Contact & Channels
        </Text>

        <View style={styles.contactList}>
          {club.contact_email && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => handleOpenLink(`mailto:${club.contact_email}`)}
            >
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
              <Text style={[styles.contactText, { color: colors.text }]}>
                {club.contact_email}
              </Text>
            </TouchableOpacity>
          )}

          {club.contact_phone && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => handleOpenLink(`tel:${club.contact_phone}`)}
            >
              <Ionicons name="call-outline" size={18} color={colors.primary} />
              <Text style={[styles.contactText, { color: colors.text }]}>
                {club.contact_phone}
              </Text>
            </TouchableOpacity>
          )}

          {hasSocials && (
            <View style={styles.socialsRow}>
              {socialLinks.facebook && (
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    { backgroundColor: "rgba(59, 130, 246, 0.12)" },
                  ]}
                  onPress={() => handleOpenLink(socialLinks.facebook)}
                >
                  <Ionicons name="logo-facebook" size={20} color="#3b82f6" />
                </TouchableOpacity>
              )}
              {socialLinks.linkedin && (
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    { backgroundColor: "rgba(10, 102, 194, 0.12)" },
                  ]}
                  onPress={() => handleOpenLink(socialLinks.linkedin)}
                >
                  <Ionicons name="logo-linkedin" size={20} color="#0a66c2" />
                </TouchableOpacity>
              )}
              {socialLinks.github && (
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    { backgroundColor: "rgba(150, 150, 150, 0.15)" },
                  ]}
                  onPress={() => handleOpenLink(socialLinks.github)}
                >
                  <Ionicons name="logo-github" size={20} color={colors.text} />
                </TouchableOpacity>
              )}
              {socialLinks.youtube && (
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                  ]}
                  onPress={() => handleOpenLink(socialLinks.youtube)}
                >
                  <Ionicons name="logo-youtube" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
              {socialLinks.website && (
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    { backgroundColor: "rgba(16, 185, 129, 0.12)" },
                  ]}
                  onPress={() => handleOpenLink(socialLinks.website)}
                >
                  <Ionicons name="globe-outline" size={20} color="#10b981" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 60,
    gap: 14,
  },
  sectionWrap: {
    gap: 12,
  },
  quoteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 16,
  },
  quoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  quoteTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  quoteText: {
    fontSize: 13,
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 1,
  },
  contactList: {
    gap: 10,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactText: {
    fontSize: 14,
    fontWeight: "500",
  },
  socialsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  socialBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
