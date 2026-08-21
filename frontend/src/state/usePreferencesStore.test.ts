import { usePreferencesStore } from "./usePreferencesStore";

describe("usePreferencesStore", () => {
  it("initializes with default preferences", () => {
    const state = usePreferencesStore.getState();
    expect(state.theme).toBe("system");
    expect(state.accentColor).toBe("ocean");
    expect(state.cardStyle).toBe("smooth");
    expect(state.language).toBe("en");
  });

  it("updates accent color correctly", () => {
    usePreferencesStore.getState().setAccentColor("sunset");
    expect(usePreferencesStore.getState().accentColor).toBe("sunset");
  });

  it("updates card geometry style correctly", () => {
    usePreferencesStore.getState().setCardStyle("pill");
    expect(usePreferencesStore.getState().cardStyle).toBe("pill");
  });

  it("updates theme mode correctly", () => {
    usePreferencesStore.getState().setTheme("oled");
    expect(usePreferencesStore.getState().theme).toBe("oled");
  });

  it("enforces extreme data-saver media invariants", () => {
    usePreferencesStore.setState({ dataSaver: "standard", autoplayMedia: true, downloadOnWifiOnly: false });
    usePreferencesStore.getState().setDataSaver("extreme");
    expect(usePreferencesStore.getState().autoplayMedia).toBe(false);
    expect(usePreferencesStore.getState().downloadOnWifiOnly).toBe(true);

    usePreferencesStore.getState().setAutoplayMedia(true);
    usePreferencesStore.getState().setDownloadOnWifiOnly(false);
    expect(usePreferencesStore.getState().autoplayMedia).toBe(false);
    expect(usePreferencesStore.getState().downloadOnWifiOnly).toBe(true);
  });
});
