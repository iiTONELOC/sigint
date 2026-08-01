import { beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { cacheClearAll } from "@/lib/cache/storageService";
import { ThemeMode } from "@/theme";
import { Domain } from "@shared/domain/identity";
import {
  flushReactUpdates,
  renderHook,
  type ReactHookResult,
  withExpectedReactError,
} from "../support/react";

enum ThemeFixtureColor {
  Aircraft = "#ff0000",
  Ships = "#00ff00",
}

type ThemeHookResult = ReactHookResult<ReturnType<typeof useTheme>>;

async function renderTheme(): Promise<ThemeHookResult> {
  const rendered = renderHook(() => useTheme(), {
    wrapper: (probe) => <ThemeProvider>{probe}</ThemeProvider>,
  });
  await flushReactUpdates();
  return rendered;
}

function renderThemeWithoutProvider(): void {
  withExpectedReactError(
    "useTheme must be used within ThemeProvider",
    () => {
      renderHook(() => useTheme());
    },
  );
}

beforeEach(async () => {
  await cacheClearAll();
});

describe("ThemeContext", () => {
  test("provides the default dark theme", async () => {
    const { result } = await renderTheme();

    expect(result.current.mode).toBe(ThemeMode.Dark);
    expect(result.current.resolvedMode).toBe(ThemeMode.Dark);
    expect(typeof result.current.theme.colors.bg).toBe("string");
    expect(result.current.colorOverrides).toEqual({
      [ThemeMode.Dark]: {},
      [ThemeMode.Light]: {},
    });
  });

  test("changes and resolves each theme mode", async () => {
    const { result } = await renderTheme();

    act(() => {
      result.current.setMode(ThemeMode.Light);
    });
    expect(result.current.mode).toBe(ThemeMode.Light);
    expect(result.current.resolvedMode).toBe(ThemeMode.Light);

    act(() => {
      result.current.setMode(ThemeMode.Auto);
    });
    expect(result.current.mode).toBe(ThemeMode.Auto);
    expect([
      ThemeMode.Dark,
      ThemeMode.Light,
    ]).toContain(result.current.resolvedMode);

    act(() => {
      result.current.setMode(ThemeMode.Dark);
    });
    expect(result.current.mode).toBe(ThemeMode.Dark);
    expect(result.current.resolvedMode).toBe(ThemeMode.Dark);
  });

  test("sets a layer color for the resolved mode", async () => {
    const { result } = await renderTheme();

    act(() => {
      result.current.setLayerColor(
        Domain.Aircraft,
        ThemeFixtureColor.Aircraft,
      );
    });

    expect(result.current.colorOverrides[ThemeMode.Dark].aircraft).toBe(
      ThemeFixtureColor.Aircraft,
    );
    expect(result.current.colorOverrides[ThemeMode.Light]).toEqual({});
  });

  test("resets one layer color", async () => {
    const { result } = await renderTheme();

    act(() => {
      result.current.setLayerColor(
        Domain.Aircraft,
        ThemeFixtureColor.Aircraft,
      );
      result.current.setLayerColor(Domain.Ships, ThemeFixtureColor.Ships);
    });
    act(() => {
      result.current.resetLayerColor(Domain.Aircraft);
    });

    expect(
      result.current.colorOverrides[ThemeMode.Dark].aircraft,
    ).toBeUndefined();
    expect(result.current.colorOverrides[ThemeMode.Dark].ships).toBe(
      ThemeFixtureColor.Ships,
    );
  });

  test("resets all layer colors", async () => {
    const { result } = await renderTheme();

    act(() => {
      result.current.setLayerColor(
        Domain.Aircraft,
        ThemeFixtureColor.Aircraft,
      );
    });
    act(() => {
      result.current.resetAllColors();
    });

    expect(result.current.colorOverrides).toEqual({
      [ThemeMode.Dark]: {},
      [ThemeMode.Light]: {},
    });
  });

  test("uses the resolved bucket for automatic mode overrides", async () => {
    const { result } = await renderTheme();

    act(() => {
      result.current.setMode(ThemeMode.Auto);
    });
    act(() => {
      result.current.setLayerColor(
        Domain.Aircraft,
        ThemeFixtureColor.Aircraft,
      );
    });

    expect(
      result.current.colorOverrides[result.current.resolvedMode].aircraft,
    ).toBe(ThemeFixtureColor.Aircraft);
  });

  test("rejects use outside the provider", () => {
    expect(renderThemeWithoutProvider).toThrow(
      "useTheme must be used within ThemeProvider",
    );
  });
});
