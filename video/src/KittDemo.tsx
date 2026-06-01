import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import { Intro } from "./components/Intro";
import { ChatInicial } from "./components/ChatInicial";
import { SceneWhatsApp } from "./components/SceneWhatsApp";
import { PhoneMockup } from "./components/PhoneMockup";
import { SceneEmail } from "./components/SceneEmail";
import { SceneDashboard } from "./components/SceneDashboard";
import { Outro } from "./components/Outro";
import { GlobalOverlay } from "./components/GlobalOverlay";

// Scene timing (30fps) — total: 1380 frames = 46s
// Intro:        0   - 105   (3.5s)
// ChatInicial:  105 - 255   (5s)
// SceneWA:      255 - 510   (8.5s)
// PhoneMockup:  510 - 780   (9s)
// SceneEmail:   780 - 1020  (8s)
// SceneDash:    1020 - 1230 (7s)
// Outro:        1230 - 1380 (5s)

export const KittDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {/* Background music — put music.mp3 in public/audio/ */}
      {/* Uncomment when you add the file: */}
      {/* <Audio src={staticFile("audio/music.mp3")} volume={0.25} /> */}

      <Sequence from={0} durationInFrames={105}>
        <Intro />
      </Sequence>
      <Sequence from={105} durationInFrames={150}>
        <ChatInicial />
      </Sequence>
      <Sequence from={255} durationInFrames={255}>
        <SceneWhatsApp />
      </Sequence>
      <Sequence from={510} durationInFrames={270}>
        <PhoneMockup />
      </Sequence>
      <Sequence from={780} durationInFrames={240}>
        <SceneEmail />
      </Sequence>
      <Sequence from={1020} durationInFrames={210}>
        <SceneDashboard />
      </Sequence>
      <Sequence from={1230} durationInFrames={150}>
        <Outro />
      </Sequence>

      {/* Global visual overlay — vignette + ambient glows + grain */}
      <GlobalOverlay />
    </AbsoluteFill>
  );
};
