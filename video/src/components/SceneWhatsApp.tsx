import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile } from "remotion";

const PURPLE = "#A78BFA";
const duration = 255;
const crossFadeStart = 115;
const crossFadeEnd = 135;

export const SceneWhatsApp: React.FC = () => {
  const frame = useCurrentFrame();

  const containerOpacity = interpolate(frame, [0, 15, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Image 1 (1a - KITT pensando)
  const img1Opacity = interpolate(
    frame,
    [0, 15, crossFadeStart, crossFadeEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const scale1 = interpolate(frame, [0, crossFadeEnd], [1, 1.04]);

  // Image 2 (1b - respuesta completa + card aprobación)
  const img2Opacity = interpolate(
    frame,
    [crossFadeStart, crossFadeEnd, duration - 20, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const scale2 = interpolate(frame, [crossFadeEnd, duration], [1, 1.06]);
  // Pan hacia abajo para mostrar el card de aprobación
  const translateY2 = interpolate(frame, [crossFadeEnd, duration], [0, -30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Label 1 (mientras KITT piensa)
  const label1Opacity = interpolate(frame, [25, 55, crossFadeStart - 10, crossFadeStart], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const label1Y = interpolate(frame, [25, 55], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Label 2 (respuesta + acción)
  const label2Opacity = interpolate(frame, [crossFadeEnd + 20, crossFadeEnd + 50, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const label2Y = interpolate(frame, [crossFadeEnd + 20, crossFadeEnd + 50], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: containerOpacity }}>

      {/* Screenshot 1a */}
      <AbsoluteFill style={{ opacity: img1Opacity }}>
        <Img
          src={staticFile("images/s1a.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale1})`,
            transformOrigin: "center center",
          }}
        />
      </AbsoluteFill>

      {/* Screenshot 1b */}
      <AbsoluteFill style={{ opacity: img2Opacity }}>
        <Img
          src={staticFile("images/s1b.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale2}) translateY(${translateY2}px)`,
            transformOrigin: "center center",
          }}
        />
      </AbsoluteFill>

      {/* Bottom gradient siempre presente */}
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
        <Tag>WhatsApp</Tag>
        <Heading>KITT lee tus conversaciones.</Heading>
      </div>

      {/* Label 2 */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 80,
          opacity: label2Opacity,
          transform: `translateY(${label2Y}px)`,
        }}
      >
        <Tag>Acción pendiente</Tag>
        <Heading>Respuesta lista.{"\n"}Un click para enviar.</Heading>
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
