import { qs } from "./api";

describe("api helper utilities", () => {
  it("formats simple query parameters correctly", () => {
    const res = qs({ area: "ai", openOnly: "true" });
    expect(res).toBe("area=ai&openOnly=true");
  });

  it("skips undefined, null, and empty string parameters", () => {
    const res = qs({ area: "ai", search: "", page: null, limit: undefined, count: 10 });
    expect(res).toBe("area=ai&count=10");
  });

  it("handles empty objects gracefully", () => {
    expect(qs({})).toBe("");
  });
});
