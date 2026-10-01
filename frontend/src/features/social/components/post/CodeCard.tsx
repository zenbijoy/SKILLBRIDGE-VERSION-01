import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { radius } from "@/theme";
import { Row, triggerHaptic } from "@/components/ui";
import { copyToClipboard } from "@/utils/safeClipboard";
import type { PostCodeMetadata } from "../../types";

interface CodeCardProps {
  codeData: PostCodeMetadata;
}

export function CodeCard({ codeData }: CodeCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    triggerHaptic("selection");
    await copyToClipboard(codeData.code, "Code Snippet");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = codeData.code.split("\n");

  return (
    <View style={styles.card}>
      {/* Top Bar */}
      <Row style={styles.topBar}>
        <Row style={{ alignItems: "center", gap: 6 }}>
          <View style={styles.macDots}>
            <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
            <View style={[styles.dot, { backgroundColor: "#F59E0B" }]} />
            <View style={[styles.dot, { backgroundColor: "#10B981" }]} />
          </View>
          <Text style={styles.langText}>
            {codeData.title || codeData.language.toUpperCase()}
          </Text>
        </Row>

        <Pressable onPress={handleCopy} style={styles.copyBtn}>
          <MaterialCommunityIcons
            name={copied ? "check" : "content-copy"}
            size={14}
            color={copied ? "#10B981" : "#94A3B8"}
          />
          <Text style={[styles.copyBtnText, { color: copied ? "#10B981" : "#94A3B8" }]}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </Row>

      {/* Code Area */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
        <View style={styles.codeContainer}>
          {lines.map((line, idx) => (
            <Row key={idx} style={styles.codeLine}>
              <Text style={styles.lineNumber}>
                {String(idx + 1).padStart(2, "0")}
              </Text>
              <Text style={styles.codeSnippet}>{line}</Text>
            </Row>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0D1117",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#30363D",
    overflow: "hidden",
    marginVertical: 8,
  },
  topBar: {
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161B22",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#30363D",
  },
  macDots: {
    flexDirection: "row",
    gap: 5,
    marginRight: 6,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  langText: {
    color: "#E6EDF3",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: "#21262D",
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  codeScroll: {
    padding: 12,
  },
  codeContainer: {
    minWidth: "100%",
  },
  codeLine: {
    alignItems: "center",
  },
  lineNumber: {
    color: "#484F58",
    fontSize: 12,
    fontFamily: "monospace",
    width: 28,
  },
  codeSnippet: {
    color: "#58A6FF",
    fontSize: 13,
    fontFamily: "monospace",
    lineHeight: 20,
  },
});
