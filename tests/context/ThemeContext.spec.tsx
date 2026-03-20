import { describe, test, expect, beforeAll } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// ── ThemeContext tests ───────────────────────────────────────────────

describe("ThemeContext", () => {
  let ThemeProvider: typeof import("@/context/ThemeContext").ThemeProvider;
  let useTheme: typeof import("@/context/ThemeContext").useTheme;

  // Fresh import each describe to avoid stale module state
  beforeAll(async () => {
    const mod = await import("@/context/ThemeContext");
    ThemeProvider = mod.ThemeProvider;
    useTheme = mod.useTheme;
  });

  function renderWithTheme(testFn: (ctx: ReturnType<typeof useTheme>) => void) {
    let captured: ReturnType<typeof useTheme>;

    function TestConsumer() {
      captured = useTheme();
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        React.createElement(ThemeProvider, {
          children: React.createElement(TestConsumer),
        }),
      );
    });

    testFn(captured!);

    act(() => {
      root.unmount();
    });
    container.remove();

    return captured!;
  }

  test("defaults to dark mode", () => {
    renderWithTheme((ctx) => {
      expect(ctx.mode).toBe("dark");
    });
  });

  test("provides theme colors object", () => {
    renderWithTheme((ctx) => {
      expect(ctx.theme).toBeDefined();
      expect(ctx.theme.colors).toBeDefined();
      expect(typeof ctx.theme.colors.bg).toBe("string");
    });
  });

  test("setMode switches to light", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let ctx: ReturnType<typeof useTheme>;

    function Consumer() {
      ctx = useTheme();
      return null;
    }

    act(() => {
      root.render(
        React.createElement(ThemeProvider, {
          children: React.createElement(Consumer),
        }),
      );
    });

    act(() => {
      ctx!.setMode("light");
    });

    expect(ctx!.mode).toBe("light");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("colorOverrides starts empty", () => {
    renderWithTheme((ctx) => {
      expect(ctx.colorOverrides).toEqual({ dark: {}, light: {} });
    });
  });

  test("setLayerColor updates overrides for current mode", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let ctx: ReturnType<typeof useTheme>;

    function Consumer() {
      ctx = useTheme();
      return null;
    }

    act(() => {
      root.render(
        React.createElement(ThemeProvider, {
          children: React.createElement(Consumer),
        }),
      );
    });

    act(() => {
      ctx!.setLayerColor("aircraft", "#ff0000");
    });

    expect(ctx!.colorOverrides.dark.aircraft).toBe("#ff0000");
    expect(ctx!.colorOverrides.light).toEqual({});

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("resetLayerColor removes single override", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let ctx: ReturnType<typeof useTheme>;

    function Consumer() {
      ctx = useTheme();
      return null;
    }

    act(() => {
      root.render(
        React.createElement(ThemeProvider, {
          children: React.createElement(Consumer),
        }),
      );
    });

    act(() => {
      ctx!.setLayerColor("aircraft", "#ff0000");
      ctx!.setLayerColor("ships", "#00ff00");
    });

    act(() => {
      ctx!.resetLayerColor("aircraft");
    });

    expect(ctx!.colorOverrides.dark.aircraft).toBeUndefined();
    expect(ctx!.colorOverrides.dark.ships).toBe("#00ff00");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("resetAllColors clears all overrides", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let ctx: ReturnType<typeof useTheme>;

    function Consumer() {
      ctx = useTheme();
      return null;
    }

    act(() => {
      root.render(
        React.createElement(ThemeProvider, {
          children: React.createElement(Consumer),
        }),
      );
    });

    act(() => {
      ctx!.setLayerColor("aircraft", "#ff0000");
    });

    act(() => {
      ctx!.resetAllColors();
    });

    expect(ctx!.colorOverrides).toEqual({ dark: {}, light: {} });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("useTheme throws outside provider", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function Orphan() {
      useTheme();
      return null;
    }

    expect(() => {
      try {
        act(() => {
          root.render(React.createElement(Orphan));
        });
      } catch (e) {
        throw e;
      }
    }).toThrow("useTheme must be used within ThemeProvider");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
