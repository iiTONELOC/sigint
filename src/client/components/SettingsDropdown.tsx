import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { mono, FONT_SM, FONT_BTN } from "./styles";

interface SettingsDropdownProps {
  readonly flat: boolean;
  readonly setFlat: (v: boolean) => void;
  readonly autoRotate: boolean;
  readonly setAutoRotate: (v: boolean) => void;
  readonly rotationSpeed: number;
  readonly setRotationSpeed: (v: number) => void;
}

export function SettingsDropdown({
  flat,
  setFlat,
  autoRotate,
  setAutoRotate,
  rotationSpeed,
  setRotationSpeed,
}: Readonly<SettingsDropdownProps>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const C = theme.colors;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        title="Settings Button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center px-1.5 py-0.5 rounded transition-all"
        style={{
          color: open ? C.accent : C.bright,
          background: open ? `${C.accent}18` : `${C.bright}10`,
          border: `1px solid ${open ? `${C.accent}70` : `${C.bright}30`}`,
          cursor: "pointer",
        }}
      >
        <Settings size={16} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 rounded z-[60]"
          style={{
            left: 0,
            background: C.panel,
            border: `1px solid ${C.border}`,
            padding: "10px 12px",
            minWidth: 180,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {/* View mode */}
          <div className="mb-2.5">
            <div
              style={{
                color: C.bright,
                fontSize: 10,
                letterSpacing: 1.5,
                opacity: 0.7,
                marginBottom: 5,
              }}
            >
              VIEW
            </div>
            <div className="flex gap-1">
              {(["globe", "flat"] as const).map((mode) => {
                const on = mode === "globe" ? !flat : flat;
                return (
                  <button
                    key={mode}
                    onClick={() => setFlat(mode === "flat")}
                    style={{
                      ...mono(on ? C.accent : C.dim, FONT_BTN),
                      background: on ? `${C.accent}18` : "transparent",
                      border: `1px solid ${on ? `${C.accent}70` : `${C.bright}33`}`,
                      borderRadius: 3,
                      padding: "3px 10px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rotation */}
          <div className="mb-2.5">
            <div
              style={{
                color: C.bright,
                fontSize: 10,
                letterSpacing: 1.5,
                opacity: 0.7,
                marginBottom: 5,
              }}
            >
              ROTATION
            </div>
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              style={{
                ...mono(autoRotate ? C.accent : C.dim, FONT_BTN),
                background: autoRotate ? `${C.accent}18` : "transparent",
                border: `1px solid ${autoRotate ? `${C.accent}70` : `${C.bright}33`}`,
                borderRadius: 3,
                padding: "3px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: 1,
              }}
            >
              {autoRotate ? "ON" : "OFF"}
            </button>
          </div>

          {/* Speed */}
          <div>
            <div
              className="flex justify-between items-center"
              style={{
                color: C.bright,
                fontSize: 10,
                letterSpacing: 1.5,
                opacity: 0.7,
                marginBottom: 5,
              }}
            >
              <span>SPEED</span>
              <span style={mono(C.accent, FONT_SM)}>
                {rotationSpeed.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              aria-label="Rotation speed"
              min={0.1}
              max={2}
              step={0.1}
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(Number(e.target.value))}
              style={{
                width: "100%",
                cursor: "pointer",
                accentColor: C.accent,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
