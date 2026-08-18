import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { api } from "@/lib/api";
import { Button, Card, H1, H2, Muted, Pill, Screen } from "@/components/ui";
import { useTheme } from "@/theme";
type Quiz = {
  id: string;
  title: string;
  skill_name: string;
  questions: { id: string; prompt: string; options: string[] }[];
};
export default function QuizScreen() {
  const { colors } = useTheme();
  const q = useQuery({
    queryKey: ["quiz"],
    queryFn: () => api<{ quiz: Quiz | null }>("/quiz/next"),
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const submit = useMutation({
    mutationFn: () =>
      api<{ score: number; passed: boolean }>("/quiz/submit", {
        method: "POST",
        body: JSON.stringify({ quizId: q.data?.quiz?.id, answers }),
      }),
    onSuccess: (r) =>
      Alert.alert(
        r.passed ? "Skill verified" : "Keep learning",
        `Score: ${r.score}%`,
      ),
  });
  const quiz = q.data?.quiz;
  if (!quiz)
    return (
      <Screen>
        <H1>Skill verification</H1>
        <Muted>No quiz is available yet.</Muted>
      </Screen>
    );
  return (
    <Screen>
      <Pill tone="accent">{quiz.skill_name}</Pill>
      <H1>{quiz.title}</H1>
      <Muted>
        Correct answers never ship to the client; scoring is server-side.
      </Muted>
      {quiz.questions.map((x, qi) => (
        <Card key={x.id}>
          <H2>
            {qi + 1}. {x.prompt}
          </H2>
          {x.options.map((o, i) => (
            <Pressable
              key={o}
              onPress={() => setAnswers((a) => ({ ...a, [x.id]: i }))}
              style={[s.option, { borderColor: colors.border }, answers[x.id] === i && { borderColor: colors.accent, backgroundColor: colors.surface2 }]}
            >
              <Text style={[s.text, { color: colors.text }]}>{o}</Text>
            </Pressable>
          ))}
        </Card>
      ))}
      <Button
        title={submit.isPending ? "Checking…" : "Submit verification"}
        disabled={
          Object.keys(answers).length !== quiz.questions.length ||
          submit.isPending
        }
        onPress={() => submit.mutate()}
      />
    </Screen>
  );
}
const s = StyleSheet.create({
  option: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {},
});
