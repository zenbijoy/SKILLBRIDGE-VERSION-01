import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme, radius } from "@/theme";
import type { PostQuoteMetadata } from "../../types";

interface QuoteCardProps {
  quoteData: PostQuoteMetadata;
}

export function QuoteCard({ quoteData }: QuoteCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: `${colors.surface}` }]}>
      <MaterialCommunityIcons name="format-quote-open" size={32} color={colors.primary} style={styles.quoteIcon} />
      <Text style={[styles.quoteText, { color: colors.text }]}>
        "{quoteData.quote}"
      </Text>
      <View style={styles.authorContainer}>
        <Text style={[styles.authorText, { color: colors.primary }]}>
          — {quoteData.author}
        </Text>
        {quoteData.source && (
          <Text style={[styles.sourceText, { color: colors.muted }]}>
            , {quoteData.source}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 20,
    marginVertical: 8,
    position: "relative",
  },
  quoteIcon: {
    opacity: 0.6,
    marginBottom: 4,
  },
  quoteText: {
    fontSize: 16,
    fontStyle: "italic",
    lineHeight: 24,
    fontWeight: "500",
  },
  authorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  authorText: {
    fontSize: 13,
    fontWeight: "700",
  },
  sourceText: {
    fontSize: 12,
    fontStyle: "italic",
  },
});
