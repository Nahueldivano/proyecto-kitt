import React from "react";
import { Composition, registerRoot } from "remotion";
import { KittDemo } from "./KittDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KittDemo"
      component={KittDemo}
      durationInFrames={1380}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
