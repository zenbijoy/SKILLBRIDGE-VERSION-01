import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, evaluateFeatureFlag, resolveDashboardWidgets } from "./dashboard.js";

test("dashboard configuration policy", async (t) => {
  await t.test("compares semantic version cores", () => {
    assert.ok(compareVersions("2.1.0", "2.0.9") > 0);
    assert.ok(compareVersions("1.9.9", "2.0.0") < 0);
    assert.strictEqual(compareVersions("2.0.0-beta.1", "2.0.0"), 0);
  });

  await t.test("filters targeting and forces required widgets visible", () => {
    const configs: Parameters<typeof resolveDashboardWidgets>[0] = [
      { widget_key: "required", title_en: "Required", title_bn: "Required BN", default_order: 5, is_required: true, is_enabled: true, target_roles: ["student"], target_campus: null, min_app_version: "2.0.0" },
      { widget_key: "admin_only", title_en: "Admin", title_bn: "Admin BN", default_order: 2, is_required: false, is_enabled: true, target_roles: ["admin"], target_campus: null, min_app_version: "2.0.0" },
      { widget_key: "campus", title_en: "Campus", title_bn: "Campus BN", default_order: 3, is_required: false, is_enabled: true, target_roles: null, target_campus: "Dhaka University", min_app_version: "2.0.0" },
      { widget_key: "future", title_en: "Future", title_bn: "Future BN", default_order: 4, is_required: false, is_enabled: true, target_roles: null, target_campus: null, min_app_version: "3.0.0" },
    ];
    const resolved = resolveDashboardWidgets(
      configs,
      [{ widget_key: "required", visible: false, order: 99 }],
      ["student"],
      "dhaka university",
      "2.1.0",
    );
    assert.deepStrictEqual(resolved.map((item) => item.widget_key), ["campus", "required"]);
    assert.strictEqual(resolved[1]?.visible, true);
    assert.deepStrictEqual(resolved.map((item) => item.order), [1, 2]);
  });

  await t.test("honors legacy tutor targeting for canonical peer tutors", () => {
    const resolved = resolveDashboardWidgets(
      [{ widget_key: "tutors", title_en: "Tutors", title_bn: "Tutors BN", default_order: 1, is_required: false, is_enabled: true, target_roles: ["tutor"], target_campus: null, min_app_version: "2.0.0" }],
      [{ widget_key: "tutors", visible: true, order: 1 }],
      ["peer_tutor"],
      null,
      "2.0.1",
    );
    assert.strictEqual(resolved.length, 1);
  });

  await t.test("feature rollouts are deterministic and role-aware", () => {
    const flag = { key: "guided_tour", is_enabled: true, rollout_percentage: 50, target_roles: ["student"] };
    const first = evaluateFeatureFlag(flag, "11111111-1111-4111-8111-111111111111", ["student"]);
    assert.strictEqual(evaluateFeatureFlag(flag, "11111111-1111-4111-8111-111111111111", ["student"]), first);
    assert.strictEqual(evaluateFeatureFlag(flag, "11111111-1111-4111-8111-111111111111", ["admin"]), false);
    assert.strictEqual(evaluateFeatureFlag({ ...flag, rollout_percentage: 0 }, "user", ["student"]), false);
    assert.strictEqual(evaluateFeatureFlag({ ...flag, rollout_percentage: 100 }, "user", ["student"]), true);
  });
});
