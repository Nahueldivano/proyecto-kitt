import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile } from "remotion";

const TAG_COLOR = "#A78BFA";
const duration = 150;

export const ChatInicial: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 20, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(frame, [0, duration], [1, 1.05]);

  const labelOpacity = interpolate(frame, [35, 65, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const labelY = interpolate(frame, [35, 65], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Chip highlights appear staggered
  const chip1 = interpolate(frame, [50, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chip2 = interpolate(frame, [70, 95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chip3 = interpolate(frame, [90, 115], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chip4 = interpolate(frame, [110, 135], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const chips = [
    { label: "Emails pendientes", opacity: chip1 },
    { label: "WhatsApp de hoy", opacity: chip2 },
    { label: "Estado del negocio", opacity: chip3 },
    { label: "Mis objetivos", opacity: chip4 },
  ];

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={staticFile("images/s5.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      />

      {/* Bottom gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 320,
          background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
        }}
      />

      {/* Animated chips row */}
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: 80,
          display: "flex",
          gap: 12,
        }}
      >
        {chips.map((chip) => (
          <div
            key={chip.label}
            style={{
              opacity: chip.opacity,
              backgroundColor: "rgba(124,58,237,0.25)",
              border: "1px solid rgba(124,58,237,0.6)",
              borderRadius: 999,
              padding: "8px 18px",
              color: TAG_COLOR,
              fontSize: 16,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontWeight: 500,
              transform: `translateY(${interpolate(chip.opacity, [0, 1], [10, 0])}px)`,
            }}
          >
            {chip.label}
          </div>
        ))}
      </div>

      {/* Main label */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 80,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
        }}
      >
        <div
          style={{
            color: TAG_COLOR,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontFamily: '"Inter", system-ui, sans-serif',
            marginBottom: 10,
          }}
        >
          Asistente de negocio
        </div>
        <div
          style={{
            color: "white",
            fontSize: 52,
            fontWeight: 700,
            fontFamily: '"Inter", system-ui, sans-serif',
            lineHeight: 1.15,
            textShadow: "0 2px 24px rgba(0,0,0,0.6)",
          }}
        >
          Preguntale lo que quieras.
        </div>
      </div>
    </AbsoluteFill>
  );
};
