import { Redirect } from "expo-router";
import { useSession } from "@/hooks/useSession";
import { SkillBridgeLoader } from "@/components/ui";

export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return <SkillBridgeLoader fullScreen size="hero" />;
  }

  return <Redirect href={session ? "/(tabs)" : "/(auth)/welcome"} />;
}
