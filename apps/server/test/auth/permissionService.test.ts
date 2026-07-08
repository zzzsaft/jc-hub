import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEffectivePermissionCodes } from "../../src/modules/auth/permission.service.js";

describe("resolveEffectivePermissionCodes", () => {
  it("returns all enabled permissions for admin", () => {
    assert.deepEqual(resolveEffectivePermissionCodes({
      roles: ["admin"],
      enabledPermissions: ["a:view", "b:view"],
      rolePermissions: [],
      allowOverrides: [],
      denyOverrides: []
    }), ["a:view", "b:view"]);
  });

  it("merges role permissions and user allow overrides", () => {
    assert.deepEqual(resolveEffectivePermissionCodes({
      roles: ["worker"],
      enabledPermissions: ["a:view", "b:view"],
      rolePermissions: ["a:view"],
      allowOverrides: ["b:view"],
      denyOverrides: []
    }), ["a:view", "b:view"]);
  });

  it("lets user deny override role allow", () => {
    assert.deepEqual(resolveEffectivePermissionCodes({
      roles: ["worker"],
      enabledPermissions: ["a:view", "b:view"],
      rolePermissions: ["a:view", "b:view"],
      allowOverrides: [],
      denyOverrides: ["b:view"]
    }), ["a:view"]);
  });
});
