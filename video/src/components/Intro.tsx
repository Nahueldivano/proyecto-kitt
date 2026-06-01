import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const KittIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="bgGradI" cx="50%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#2c2c2c" />
        <stop offset="100%" stopColor="#0d0d0d" />
      </radialGradient>
      <linearGradient id="sGradI" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#d0d0d0" />
        <stop offset="100%" stopColor="#888888" />
      </linearGradient>
      <filter id="redGlowI" x="-50%" y="-200%" width="200%" height="500%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect x="1" y="1" width="98" height="98" rx="22" fill="url(#bgGradI)" stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" />
    <text x="50" y="68" textAnchor="middle" fontSize="66" fontWeight="900" fill="url(#sGradI)" fontFamily="'Arial Black', Arial, sans-serif">S</text>
    <line x1="10" y1="50" x2="90" y2="50" stroke="#cc2200" strokeWidth="2" filter="url(#redGlowI)" opacity="0.95" />
    <line x1="30" y1="50" x2="70" y2="50" stroke="#ff4400" strokeWidth="0.8" opacity="1" />
  </svg>
);

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = 105;

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 60 },
    from: 0.4,
    to: 1,
  });

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineOpacity = interpolate(frame, [45, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineY = interpolate(frame, [45, 75], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const containerOpacity = interpolate(frame, [duration - 20, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle glow pulse on the icon
  const glowOpacity = interpolate(
    frame % 60,
    [0, 30, 60],
    [0.3, 0.7, 0.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "center",
        alignItems: "center",
        opacity: containerOpacity,
      }}
    >
      {/* Radial glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(124,58,237,${glowOpacity}) 0%, transparent 70%)`,
          opacity: logoOpacity,
        }}
      />

      {/* Logo + title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
        }}
      >
        <KittIcon size={72} />
        <div
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 80,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          KITT
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          position: "absolute",
          bottom: "32%",
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: 22,
          color: "rgba(255,255,255,0.5)",
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Tu negocio. KITT hace el resto.
      </div>
    </AbsoluteFill>
  );
};
