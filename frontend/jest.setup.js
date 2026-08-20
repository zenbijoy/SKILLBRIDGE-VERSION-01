/* eslint-disable no-undef */
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
process.env.EXPO_PUBLIC_API_URL = "http://localhost:3000/api/v1";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
