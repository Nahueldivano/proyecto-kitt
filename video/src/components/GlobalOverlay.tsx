import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const GlobalOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle breathing glow in the background
  const glowIntensity = interpolate(
    frame % 120,
    [0, 60, 120],
    [0.04, 0.09, 0.04]
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.72) 100%)",
          zIndex: 10,
        }}
      />

      {/* Top gradient bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)",
          zIndex: 10,
        }}
      />

      {/* Subtle purple ambient glow — top right */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(124,58,237,${glowIntensity}) 0%, transparent 70%)`,
          zIndex: 9,
        }}
      />

      {/* Subtle blue ambient glow — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: -100,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(59,130,246,${glowIntensity * 0.6}) 0%, transparent 70%)`,
          zIndex: 9,
        }}
      />

      {/* Very subtle noise/grain overlay using CSS */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: "256px 256px",
          zIndex: 11,
        }}
      />
    </AbsoluteFill>
  );
};
