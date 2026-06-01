import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile } from "remotion";

const PURPLE = "#A78BFA";
const duration = 210;
const crossFadeStart = 80;
const crossFadeEnd = 100;

export const SceneDashboard: React.FC = () => {
  const frame = useCurrentFrame();

  const containerOpacity = interpolate(frame, [0, 15, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Screenshot 4a (KITT procesando)
  const img1Opacity = interpolate(
    frame,
    [0, 15, crossFadeStart, crossFadeEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Screenshot 4b (dashboard completo)
  const img2Opacity = interpolate(
    frame,
    [crossFadeStart, crossFadeEnd, duration - 20, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Ken Burns hacia los números del dashboard (esquina superior derecha del panel)
  const scale2 = interpolate(frame, [crossFadeEnd, duration], [1, 1.08]);
  const translateX2 = interpolate(frame, [crossFadeEnd, duration], [0, -60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY2 = interpolate(frame, [crossFadeEnd, duration], [0, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Label 1
  const label1Opacity = interpolate(frame, [20, 50, crossFadeStart - 10, crossFadeStart], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const label1Y = interpolate(frame, [20, 50], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Label 2 - stat badges animados
  const label2Opacity = interpolate(frame, [crossFadeEnd + 20, crossFadeEnd + 50, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const label2Y = interpolate(frame, [crossFadeEnd + 20, crossFadeEnd + 50], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badges de stats que aparecen escalonados
  const badgeFrame = Math.max(0, frame - crossFadeEnd - 30);
  const badge1 = interpolate(badgeFrame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badge2 = interpolate(badgeFrame, [15, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badge3 = interpolate(badgeFrame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badge4 = interpolate(badgeFrame, [45, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const badges = [
    { num: "5", label: "Clientes activos", opacity: badge1 },
    { num: "4", label: "Pendientes clave", opacity: badge2 },
    { num: "2", label: "Entregas hechas", opacity: badge3 },
    { num: "1", label: "Venta en curso", opacity: badge4 },
  ];

  return (
    <AbsoluteFill style={{ opacity: containerOpacity }}>

      {/* Screenshot 4a */}
      <AbsoluteFill style={{ opacity: img1Opacity }}>
        <Img
          src={staticFile("images/s4a.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scale(1.02)",
            transformOrigin: "center center",
          }}
        />
      </AbsoluteFill>

      {/* Screenshot 4b */}
      <AbsoluteFill style={{ opacity: img2Opacity }}>
        <Img
          src={staticFile("images/s4b.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale2}) translate(${translateX2}px, ${translateY2}px)`,
            transformOrigin: "center center",
          }}
        />
      </AbsoluteFill>

      {/* Bottom gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: 300,
          background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Label 1 */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 80,
          opacity: label1Opacity,
          transform: `translateY(${label1Y}px)`,
        }}
      >
        <Tag>Dashboard</Tag>
        <Heading>Generando vista{"\n"}de tu negocio...</Heading>
      </div>

      {/* Label 2 + stat badges */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 80,
          opacity: label2Opacity,
          transform: `translateY(${label2Y}px)`,
        }}
      >
        <Tag>Dashboard de actividad</Tag>
        <Heading>Todo lo que pasó.{"\n"}Al instante.</Heading>

        {/* Stat badges */}
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          {badges.map((b) => (
            <div
              key={b.label}
              style={{
                opacity: b.opacity,
                transform: `translateY(${interpolate(b.opacity, [0, 1], [12, 0])}px)`,
                backgroundColor: "rgba(124,58,237,0.2)",
                border: "1px solid rgba(124,58,237,0.5)",
                borderRadius: 10,
                padding: "10px 18px",
                textAlign: "center",
              }}
            >
              <div style={{
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 32,
                fontWeight: 800,
                color: PURPLE,
                lineHeight: 1,
              }}>
                {b.num}
              </div>
              <div style={{
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
                marginTop: 4,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                {b.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      color: PURPLE,
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      fontFamily: '"Inter", system-ui, sans-serif',
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      color: "white",
      fontSize: 52,
      fontWeight: 700,
      fontFamily: '"Inter", system-ui, sans-serif',
      lineHeight: 1.2,
      textShadow: "0 2px 24px rgba(0,0,0,0.6)",
      whiteSpace: "pre-line",
    }}
  >
    {children}
  </div>
);
