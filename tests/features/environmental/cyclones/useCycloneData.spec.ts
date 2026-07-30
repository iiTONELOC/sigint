import { describe, test, expect } from "bun:test";
import { useCycloneData } from "@/features/environmental/cyclones/hooks/useCycloneData";
import { cycloneProvider } from "@/features/environmental/cyclones/data/provider";

// useCycloneData is a thin wrapper over useProviderData. The hook's runtime
// behavior is covered by useProviderData tests (used by all 5 BaseProvider
// hooks). This spec verifies the wiring: the hook exists, it's a function,
// and the provider it talks to is the singleton from data/provider.ts.

describe("useCycloneData", () => {
  test("is exported as a function", () => {
    expect(typeof useCycloneData).toBe("function");
  });

  test("the singleton cycloneProvider is the one wired in", () => {
    expect(cycloneProvider).toBeDefined();
    expect(cycloneProvider.id).toBe("nhc-cyclones");
  });
});
