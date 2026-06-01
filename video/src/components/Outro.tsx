import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const duration = 150;

const KittIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="bgGradO" cx="50%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#2c2c2c" />
        <stop offset="100%" stopColor="#0d0d0d" />
      </radialGradient>
      <linearGradient id="sGradO" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#d0d0d0" />
        <stop offset="100%" stopColor="#888888" />
      </linearGradient>
      <filter id="redGlowO" x="-50%" y="-200%" width="200%" height="500%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <rect x="1" y="1" width="98" height="98" rx="22" fill="url(#bgGradO)" stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" />
    <text x="50" y="68" textAnchor="middle" fontSize="66" fontWeight="900" fill="url(#sGradO)" fontFamily="'Arial Black', Arial, sans-serif">S</text>
    <line x1="10" y1="50" x2="90" y2="50" stroke="#cc2200" strokeWidth="2" filter="url(#redGlowO)" opacity="0.95" />
    <line x1="30" y1="50" x2="70" y2="50" stroke="#ff4400" strokeWidth="0.8" opacity="1" />
  </svg>
);

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(frame, [duration - 30, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(fadeIn, fadeOut);

  // Logo group slides up
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 70 },
    from: 30,
    to: 0,
  });

  // Tagline appears after logo
  const taglineOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [30, 60], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beta pill appears
  const betaOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const betaScale = spring({
    frame: Math.max(0, frame - 60),
    fps,
    config: { damping: 12, stiffness: 80 },
    from: 0.7,
    to: 1,
  });

  // Feature pills appear staggered
  const pill1 = interpolate(frame, [80, 105], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pill2 = interpolate(frame, [95, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pill3 = interpolate(frame, [110, 135], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const features = [
    { label: "WhatsApp", icon: "💬", opacity: pill1 },
    { label: "Gmail", icon: "📧", opacity: pill2 },
    { label: "Reportes", icon: "📊", opacity: pill3 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 65%)",
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          transform: `translateY(${logoSpring}px)`,
        }}
      >
        {/* Icon + KITT */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
          <KittIcon size={52} />
          <div style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 72,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.04em",
          }}>
            KITT
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 24,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.04em",
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            marginBottom: 40,
          }}
        >
          Tu negocio. KITT hace el resto.
        </div>

        {/* Beta pill */}
        <div
          style={{
            opacity: betaOpacity,
            transform: `scale(${betaScale})`,
            backgroundColor: "rgba(124,58,237,0.25)",
            border: "1px solid rgba(124,58,237,0.7)",
            borderRadius: 999,
            padding: "10px 28px",
            marginBottom: 32,
          }}
        >
          <span style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 16,
            fontWeight: 600,
            color: "#A78BFA",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Beta disponible
          </span>
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 14 }}>
          {features.map((f) => (
            <div
              key={f.label}
              style={{
                opacity: f.opacity,
                transform: `translateY(${interpolate(f.opacity, [0, 1], [10, 0])}px)`,
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 999,
                padding: "8px 18px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>{f.icon}</span>
              <span style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: 14,
                fontFamily: '"Inter", system-ui, sans-serif',
                fontWeight: 500,
              }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
