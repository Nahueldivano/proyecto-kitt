import React from "react"

interface KittLogoProps {
  size?: number
  className?: string
}

export function KittLogo({ size = 48, className }: KittLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id="kl-bg" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#2c2c2c" />
          <stop offset="100%" stopColor="#0d0d0d" />
        </radialGradient>
        <linearGradient id="kl-s" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#d4d4d4" />
          <stop offset="100%" stopColor="#888888" />
        </linearGradient>
        <filter id="kl-glow" x="-60%" y="-300%" width="220%" height="700%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Fondo redondeado */}
      <rect
        x="1" y="1" width="98" height="98" rx="22"
        fill="url(#kl-bg)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1.5"
      />

      {/* Letra S metálica */}
      <text
        x="50" y="68"
        textAnchor="middle"
        fontSize="66"
        fontWeight="900"
        fill="url(#kl-s)"
        fontFamily="'Arial Black', Arial, sans-serif"
      >
        S
      </text>

      {/* Línea roja con glow */}
      <line
        x1="10" y1="50" x2="90" y2="50"
        stroke="#cc2200"
        strokeWidth="2"
        filter="url(#kl-glow)"
        opacity="0.95"
      />
      <line
        x1="28" y1="50" x2="72" y2="50"
        stroke="#ff4400"
        strokeWidth="0.8"
        opacity="1"
      />
    </svg>
  )
}
