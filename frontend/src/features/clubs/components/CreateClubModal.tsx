import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubCategory, ClubMembershipType } from "../types";
import { CLUB_CATEGORIES } from "../constants";
import { useI18n } from "../../../i18n";
import { clubErrorMessage } from "../lib/apiErrors";
import api from "../../../services/api";

interface CreateClubModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (newClubId: string) => void;
}

export const CreateClubModal: React.FC<CreateClubModalProps> = ({
  visible,
  onClose,
  onCreated,
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Identity
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<ClubCategory>("Technology");
  const [university, setUniversity] = useState("Rajshahi University of Engineering & Technology");
  const [department, setDepartment] = useState("");

  // Step 2: About & Vision
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState("");
  const [vision, setVision] = useState("");
  const [foundedYear, setFoundedYear] = useState(new Date().getFullYear().toString());

  // Step 3: Governance & Contact
  const [membershipType, setMembershipType] = useState<ClubMembershipType>("open");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [facebook, setFacebook] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setStep(1);
    setName("");
    setTagline("");
    setCategory("Technology");
    setDescription("");
    setMission("");
    setVision("");
    setDepartment("");
    setContactEmail("");
    setWebsite("");
    setFacebook("");
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert("Required", "Please enter a club name.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!description.trim()) {
        Alert.alert("Required", "Please provide a brief description for your club.");
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleCreateClub = async () => {
    try {
      setSubmitting(true);
      const social_links: Record<string, string> = {};
      if (website.trim()) social_links.website = website.trim();
      if (facebook.trim()) social_links.facebook = facebook.trim();

      const res = await api.post("/clubs", {
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        description: description.trim(),
        category,
        university: university.trim() || undefined,
        department: department.trim() || undefined,
        mission: mission.trim() || undefined,
        vision: vision.trim() || undefined,
        founded_year: foundedYear ? parseInt(foundedYear, 10) : undefined,
        membership_type: membershipType,
        contact_email: contactEmail.trim() || undefined,
        social_links: Object.keys(social_links).length ? social_links : undefined,
      });

      const newClub = res.data?.club || res.data;
      Alert.alert(
        "Club Created! 🎉",
        "Your club has been founded! As the club owner, you have full leadership administrative controls."
      );
      resetForm();
      onClose();
      if (newClub?.id) {
        onCreated(newClub.id);
      }
    } catch (err: unknown) {
      Alert.alert(
        "Creation Failed",
        clubErrorMessage(err, t)
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                Create a University Club
              </Text>
              <Text style={[styles.stepSub, { color: colors.textSecondary }]}>
                Step {step} of 3 ·{" "}
                {step === 1
                  ? "Identity & Category"
                  : step === 2
                  ? "Mission & Story"
                  : "Governance & Contact"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                {
                  backgroundColor: colors.primary,
                  width: step === 1 ? "33%" : step === 2 ? "66%" : "100%",
                },
              ]}
            />
          </View>

          {/* Form Content */}
          <ScrollView contentContainerStyle={styles.formScroll}>
            {step === 1 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Club Name *
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
                  placeholder="e.g. SkillBridge Autonomous Robotics Club"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Short Tagline
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
                  placeholder="e.g. Building the future of robotics and automation"
                  placeholderTextColor={colors.textSecondary}
                  value={tagline}
                  onChangeText={setTagline}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Category *
                </Text>
                <View style={styles.categoryGrid}>
                  {CLUB_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.catOption,
                        category === cat.id && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                        { borderColor: colors.border },
                      ]}
                      onPress={() => setCategory(cat.id as ClubCategory)}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={16}
                        color={category === cat.id ? "#fff" : colors.text}
                      />
                      <Text
                        style={[
                          styles.catOptionText,
                          { color: category === cat.id ? "#fff" : colors.text },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  University / Campus
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
                  placeholder="University Name"
                  placeholderTextColor={colors.textSecondary}
                  value={university}
                  onChangeText={setUniversity}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Affiliated Department (optional)
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
                  placeholder="e.g. Dept of Computer Science & Engineering"
                  placeholderTextColor={colors.textSecondary}
                  value={department}
                  onChangeText={setDepartment}
                />
              </>
            )}

            {step === 2 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Detailed Description *
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
                  placeholder="What is this club about? Who is it for? What projects and workshops will members participate in?"
                  placeholderTextColor={colors.textSecondary}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Club Mission (optional)
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
                  placeholder="The actionable, everyday purpose of your community"
                  placeholderTextColor={colors.textSecondary}
                  value={mission}
                  onChangeText={setMission}
                  multiline
                  numberOfLines={2}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Club Vision (optional)
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
                  placeholder="The big-picture long term impact you aspire to create"
                  placeholderTextColor={colors.textSecondary}
                  value={vision}
                  onChangeText={setVision}
                  multiline
                  numberOfLines={2}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Founded Year
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
                  placeholder="2026"
                  placeholderTextColor={colors.textSecondary}
                  value={foundedYear}
                  onChangeText={setFoundedYear}
                  keyboardType="numeric"
                />
              </>
            )}

            {step === 3 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Membership Policy
                </Text>
                <View style={styles.memTypeCol}>
                  {(
                    [
                      {
                        id: "open",
                        title: "Open Membership",
                        desc: "Any student can join instantly with one click.",
                      },
                      {
                        id: "application",
                        title: "Application & Screening",
                        desc: "Applicants submit an application for leaders to review.",
                      },
                      {
                        id: "invite_only",
                        title: "Invite Only",
                        desc: "Private club where members must be invited by leaders.",
                      },
                    ] as const
                  ).map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.memPolicyCard,
                        membershipType === opt.id && {
                          borderColor: colors.primary,
                          backgroundColor: "rgba(59, 130, 246, 0.08)",
                        },
                        {
                          borderColor:
                            membershipType === opt.id
                              ? colors.primary
                              : colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                      onPress={() => setMembershipType(opt.id)}
                    >
                      <View style={styles.policyRow}>
                        <Ionicons
                          name={
                            membershipType === opt.id
                              ? "radio-button-on"
                              : "radio-button-off"
                          }
                          size={18}
                          color={
                            membershipType === opt.id
                              ? colors.primary
                              : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.policyTitle,
                            {
                              color:
                                membershipType === opt.id
                                  ? colors.primary
                                  : colors.text,
                            },
                          ]}
                        >
                          {opt.title}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.policyDesc,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {opt.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Official Contact Email
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
                  placeholder="contact@ruetrobotics.org"
                  placeholderTextColor={colors.textSecondary}
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Website / Portfolio Link
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
                  value={website}
                  onChangeText={setWebsite}
                  autoCapitalize="none"
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Facebook Page / Group URL
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
                  placeholder="https://facebook.com/..."
                  placeholderTextColor={colors.textSecondary}
                  value={facebook}
                  onChangeText={setFacebook}
                  autoCapitalize="none"
                />
              </>
            )}
          </ScrollView>

          {/* Navigation Buttons */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {step > 1 ? (
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: colors.border }]}
                onPress={handleBack}
              >
                <Text style={[styles.backBtnText, { color: colors.text }]}>
                  Back
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80 }} />
            )}

            {step < 3 ? (
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={handleNext}
              >
                <Text style={styles.nextBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreateClub}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="rocket-outline" size={16} color="#fff" />
                    <Text style={styles.nextBtnText}>Launch Club</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    height: "85%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  stepSub: {
    fontSize: 12,
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(150, 150, 150, 0.15)",
  },
  progressBar: {
    height: "100%",
  },
  formScroll: {
    padding: 18,
    paddingBottom: 30,
    gap: 10,
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
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  catOptionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  memTypeCol: {
    gap: 8,
  },
  memPolicyCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  policyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  policyDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 26,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
