import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { H1, Muted, Screen, Button } from "@/components/ui";
import { colors } from "@/theme";

export default function LiveRoomScreenWeb() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  return (
    <Screen>
      <View style={s.container}>
        <H1>Live Classroom: {roomId}</H1>
        <Muted style={s.text}>
          Browser classroom support is currently being initialized.
        </Muted>
        <Muted style={s.text}>
          Please use the Android or iOS app for the native classroom experience for now.
        </Muted>

        <Button title="Go Back" onPress={() => router.back()} style={s.button} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  text: {
    textAlign: "center",
    marginVertical: 8,
  },
  button: {
    marginTop: 24,
  }
});
