import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile } from "remotion";

const PURPLE = "#A78BFA";
const duration = 240;
const crossFadeStart = 105;
const crossFadeEnd = 125;

export const SceneEmail: React.FC = () => {
  const frame = useCurrentFrame();

  const containerOpacity = interpolate(frame, [0, 15, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Screenshot 3a (lista de emails)
  const img1Opacity = interpolate(
    frame,
    [0, 15, crossFadeStart, crossFadeEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const scale1 = interpolate(frame, [0, crossFadeEnd], [1, 1.04]);

  // Screenshot 3b (dashboard de prioridades)
  const img2Opacity = interpolate(
    frame,
    [crossFadeStart, crossFadeEnd, duration - 20, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  // Zoom lento hacia los badges de prioridad (lado derecho)
  const scale2 = interpolate(frame, [crossFadeEnd, duration], [1, 1.07]);
  const translateX2 = interpolate(frame, [crossFadeEnd, duration], [0, -40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Label 1
  const label1Opacity = interpolate(frame, [25, 55, crossFadeStart - 10, crossFadeStart], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const label1Y = interpolate(frame, [25, 55], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Label 2 - stat animado "50+ emails"
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

      {/* Screenshot 3a */}
      <AbsoluteFill style={{ opacity: img1Opacity }}>
        <Img
          src={staticFile("images/s3a.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale1})`,
            transformOrigin: "center center",
          }}
        />
      </AbsoluteFill>

      {/* Screenshot 3b */}
      <AbsoluteFill style={{ opacity: img2Opacity }}>
        <Img
          src={staticFile("images/s3b.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale2}) translateX(${translateX2}px)`,
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
        <Tag>Gmail</Tag>
        <Heading>KITT organiza{"\n"}tus emails.</Heading>
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
        <Tag>Prioridades automáticas</Tag>
        <Heading>50+ emails.{"\n"}Lo urgente, primero.</Heading>
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
