import { Image } from "react-native";
import { usePreferencesStore } from "@/state/usePreferencesStore";
import { nextGenAssets } from "./assetMap";

export function RoomHeroArt() {
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);
  return (
    <Image
      source={reduceMotion ? nextGenAssets.illustrations.studyRoom : nextGenAssets.animation.loader}
      resizeMode="cover"
      style={{ width: "100%", aspectRatio: 1.5, borderRadius: 24 }}
      accessibilityLabel="SkillBridge study room visual"
    />
  );
}
