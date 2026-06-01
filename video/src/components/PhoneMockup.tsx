import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const duration = 270;

// Timing dentro de esta escena
const PHONE_SLIDE_IN = 0;
const PHONE_SLIDE_END = 25;
const MSG_INCOMING_START = 40;
const MSG_INCOMING_END = 60;
const TYPING_START = 68;
const TYPING_END = 110;
const MSG_SENT_START = 118;
const MSG_SENT_END = 138;
const SENT_CHECK_START = 143;
const SENT_CHECK_END = 160;
const PHONE_SLIDE_OUT = 235;

export const PhoneMockup: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(frame, [0, 15, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Phone slides in from right
  const phoneSlide = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 70 },
    from: 160,
    to: 0,
  });

  // Phone slides out to left at end
  const phoneSlideOut = interpolate(frame, [PHONE_SLIDE_OUT, duration - 10], [0, -160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const phoneX = frame < PHONE_SLIDE_OUT ? phoneSlide : phoneSlideOut;

  // Incoming message
  const incomingOpacity = interpolate(frame, [MSG_INCOMING_START, MSG_INCOMING_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const incomingY = interpolate(frame, [MSG_INCOMING_START, MSG_INCOMING_END], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Typing indicator
  const typingOpacity = interpolate(frame, [TYPING_START, TYPING_START + 10, TYPING_END, TYPING_END + 10], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bouncing dots for typing
  const dot1Y = Math.sin((frame - TYPING_START) * 0.4) * 3;
  const dot2Y = Math.sin((frame - TYPING_START) * 0.4 - 0.8) * 3;
  const dot3Y = Math.sin((frame - TYPING_START) * 0.4 - 1.6) * 3;

  // Sent message
  const sentOpacity = interpolate(frame, [MSG_SENT_START, MSG_SENT_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sentY = interpolate(frame, [MSG_SENT_START, MSG_SENT_END], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sent checkmark
  const checkOpacity = interpolate(frame, [SENT_CHECK_START, SENT_CHECK_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Left side label
  const labelOpacity = interpolate(frame, [40, 70, PHONE_SLIDE_OUT, PHONE_SLIDE_OUT + 20], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [40, 70], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const PHONE_W = 320;
  const PHONE_H = 660;

  return (
    <AbsoluteFill style={{ opacity: containerOpacity, backgroundColor: "#0a0a0a" }}>

      {/* Background gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 70% 50%, rgba(124,58,237,0.12) 0%, transparent 65%)",
        }}
      />

      {/* Left label */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: "50%",
          transform: `translateY(calc(-50% + ${labelY}px))`,
          opacity: labelOpacity,
          maxWidth: 520,
        }}
      >
        <div style={{
          color: "#A78BFA",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontFamily: '"Inter", system-ui, sans-serif',
          marginBottom: 10,
        }}>
          WhatsApp
        </div>
        <div style={{
          color: "white",
          fontSize: 48,
          fontWeight: 700,
          fontFamily: '"Inter", system-ui, sans-serif',
          lineHeight: 1.2,
          textShadow: "0 2px 24px rgba(0,0,0,0.4)",
          whiteSpace: "pre-line",
        }}>
          Redacta.{"\n"}Vos aprobás.{"\n"}KITT lo manda.
        </div>
      </div>

      {/* Phone mockup */}
      <div
        style={{
          position: "absolute",
          right: 180,
          top: "50%",
          transform: `translate(${phoneX}px, -50%)`,
          width: PHONE_W,
          height: PHONE_H,
        }}
      >
        {/* Phone body */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 44,
            backgroundColor: "#1a1a1a",
            border: "2px solid rgba(255,255,255,0.12)",
            overflow: "hidden",
            boxShadow: "0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Status bar */}
          <div style={{
            height: 44,
            backgroundColor: "#128C7E",
            display: "flex",
            alignItems: "center",
            paddingLeft: 14,
            paddingRight: 14,
            flexShrink: 0,
          }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
              flexShrink: 0,
            }}>
              <span style={{ color: "white", fontSize: 14, fontWeight: 700, fontFamily: '"Inter", system-ui, sans-serif' }}>
                AR
              </span>
            </div>
            <div>
              <div style={{ color: "white", fontSize: 14, fontWeight: 600, fontFamily: '"Inter", system-ui, sans-serif' }}>
                Andrea Rossi
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>
                en línea
              </div>
            </div>
          </div>

          {/* Chat area */}
          <div style={{
            flex: 1,
            backgroundColor: "#ECE5DD",
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            gap: 6,
            overflow: "hidden",
          }}>

            {/* Old message for context */}
            <div style={{ alignSelf: "flex-start", maxWidth: "80%" }}>
              <div style={{
                backgroundColor: "white",
                borderRadius: "12px 12px 12px 2px",
                padding: "8px 12px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }}>
                <p style={{ margin: 0, fontSize: 13, color: "#303030", fontFamily: '"Inter", system-ui, sans-serif', lineHeight: 1.4 }}>
                  Hola! Consulta por el presupuesto que me mandaste 📋
                </p>
                <span style={{ fontSize: 10, color: "#999", float: "right", marginTop: 2, fontFamily: '"Inter", system-ui, sans-serif' }}>
                  10:41
                </span>
              </div>
            </div>

            {/* Incoming message (animated) */}
            <div style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
              opacity: incomingOpacity,
              transform: `translateY(${incomingY}px)`,
            }}>
              <div style={{
                backgroundColor: "white",
                borderRadius: "12px 12px 12px 2px",
                padding: "8px 12px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }}>
                <p style={{ margin: 0, fontSize: 13, color: "#303030", fontFamily: '"Inter", system-ui, sans-serif', lineHeight: 1.4 }}>
                  ¿Cuándo me podés confirmar? Necesito saber para esta semana 🙏
                </p>
                <span style={{ fontSize: 10, color: "#999", float: "right", marginTop: 2, fontFamily: '"Inter", system-ui, sans-serif' }}>
                  10:43
                </span>
              </div>
            </div>

            {/* Typing indicator */}
            <div style={{
              alignSelf: "flex-end",
              opacity: typingOpacity,
              backgroundColor: "#DCF8C6",
              borderRadius: "12px 12px 2px 12px",
              padding: "10px 14px",
              display: "flex",
              gap: 4,
              alignItems: "center",
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#999", transform: `translateY(${dot1Y}px)` }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#999", transform: `translateY(${dot2Y}px)` }} />
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#999", transform: `translateY(${dot3Y}px)` }} />
            </div>

            {/* Sent message (from KITT) */}
            <div style={{
              alignSelf: "flex-end",
              maxWidth: "82%",
              opacity: sentOpacity,
              transform: `translateY(${sentY}px)`,
            }}>
              <div style={{
                backgroundColor: "#DCF8C6",
                borderRadius: "12px 12px 2px 12px",
                padding: "8px 12px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }}>
                <p style={{ margin: 0, fontSize: 13, color: "#303030", fontFamily: '"Inter", system-ui, sans-serif', lineHeight: 1.4 }}>
                  Hola Andrea, te mando el presupuesto mañana a las 10hs. Cualquier cosa me avisás 👍
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#999", fontFamily: '"Inter", system-ui, sans-serif' }}>10:44</span>
                  {/* Double checkmark */}
                  <span style={{ fontSize: 12, color: "#53bdeb", opacity: checkOpacity }}>✓✓</span>
                </div>
              </div>
            </div>

          </div>

          {/* Bottom input bar */}
          <div style={{
            height: 52,
            backgroundColor: "#F0F0F0",
            display: "flex",
            alignItems: "center",
            paddingLeft: 10,
            paddingRight: 10,
            gap: 8,
            flexShrink: 0,
          }}>
            <div style={{
              flex: 1,
              height: 34,
              backgroundColor: "white",
              borderRadius: 17,
              display: "flex",
              alignItems: "center",
              paddingLeft: 14,
            }}>
              <span style={{ color: "#999", fontSize: 13, fontFamily: '"Inter", system-ui, sans-serif' }}>Mensaje</span>
            </div>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              backgroundColor: "#128C7E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{ color: "white", fontSize: 16 }}>🎤</span>
            </div>
          </div>

        </div>

        {/* KITT badge overlay */}
        <div style={{
          position: "absolute",
          top: -18,
          right: -18,
          backgroundColor: "#7C3AED",
          borderRadius: 20,
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 4px 16px rgba(124,58,237,0.5)",
          opacity: interpolate(frame, [MSG_SENT_START, MSG_SENT_END], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#4ade80",
          }} />
          <span style={{
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            Enviado por KITT
          </span>
        </div>

      </div>
    </AbsoluteFill>
  );
};
