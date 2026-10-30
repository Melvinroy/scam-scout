"use client";

import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Suspense, useEffect, useRef, useState } from "react";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { City } from "@/components/world/city";
import { DeskStaff, FieldScouts } from "@/components/world/scouts";
import { useWorld } from "@/lib/state/stores";

useGLTF.setDecoderPath("/draco/");

const TOUR = [
  { pos: [12.2, 8.4, 12.2], target: [0, 0.6, 0] },
  { pos: [-3.2, 5.4, 6.2], target: [-7.1, 0.8, 1.2] },
  { pos: [11.2, 5.6, 2.4], target: [7.4, 0.8, 0.2] },
  { pos: [9.4, 6.4, 9.2], target: [6.4, 0.6, 5.2] },
  { pos: [-1.4, 5.2, -1.2], target: [-3.8, 1.2, -6.3] },
  { pos: [3.4, 3.4, 4.2], target: [0.3, 0.5, 1.2] },
];

export function ScoutWorld({ tourIndex = null, director = false, autoOrbit = false }: { tourIndex?: number | null; director?: boolean; autoOrbit?: boolean }) {
  const [tier] = useState<"high" | "low">(() => {
    if (typeof window === "undefined") return "high";
    const narrow = window.innerWidth < 800;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return narrow || reduced ? "low" : "high";
  });

  return (
    <Canvas
      shadows
      camera={{ position: [18, 13, 18], fov: 32, near: 0.1, far: 80 }}
      dpr={tier === "low" ? 1 : [1, 1.6]}
      gl={{ antialias: tier === "low", alpha: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
      onPointerMissed={() => useWorld.getState().select(null)}
    >
      <color attach="background" args={["#12110e"]} />
      <fog attach="fog" args={["#12110e", 18, 36]} />
      <hemisphereLight args={["#f0e2c8", "#1a1814", 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={2.6}
        color="#fff4e4"
        castShadow={tier === "high"}
        shadow-mapSize={tier === "high" ? [1024, 1024] : [256, 256]}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 3.2, 1.2]} intensity={16} distance={10} color="#ffd9a0" />
      <Suspense fallback={null}>
        <City />
        <DeskStaff />
        <FieldScouts />
      </Suspense>
      <ContactShadows position={[0, -0.03, 0]} opacity={0.45} scale={28} blur={2.2} far={3.5} />
      <CameraRig tourIndex={tourIndex} director={director} autoOrbit={autoOrbit && tier === "high"} />
      <EffectComposer multisampling={0} enableNormalPass={tier === "high"}>
        {tier === "high" ? <N8AO aoRadius={0.55} intensity={1.15} aoSamples={6} denoiseSamples={4} distanceFalloff={0.6} /> : null}
        <Bloom luminanceThreshold={0.86} intensity={0.42} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.62} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        {tier === "high" ? <SMAA /> : null}
      </EffectComposer>
    </Canvas>
  );
}

function CameraRig({ tourIndex, director, autoOrbit }: { tourIndex: number | null; director: boolean; autoOrbit: boolean }) {
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const desired = useRef(new THREE.Vector3(12.2, 8.4, 12.2));
  const look = useRef(new THREE.Vector3(0, 0.6, 0));
  const from = useRef(new THREE.Vector3(20, 14, 20));
  const intro = useRef(0);
  const [ready, setReady] = useState(false);
  const { camera } = useThree();
  const stamp = useWorld((state) => state.world.stamp);
  const beacon = useWorld((state) => state.world.reactions.regulator?.beacon);
  const touring = tourIndex != null && tourIndex > 0;

  useEffect(() => {
    if (!director || touring) return;
    if (stamp) {
      camera.position.set(3.6, 2.8, 4.4);
      controls.current?.target.set(0.3, 0.5, 1.2);
      controls.current?.update();
    } else if (beacon === "red") {
      camera.position.set(-1.2, 4.4, -2);
      controls.current?.target.set(-3.8, 1.1, -6.2);
      controls.current?.update();
    }
  }, [director, stamp, beacon, camera, touring]);

  useFrame((_, delta) => {
    intro.current = Math.min(1, intro.current + delta / 2.6);
    if (!ready && intro.current >= 1) setReady(true);
    if (!touring) {
      if (intro.current < 1) {
        const eased = 1 - (1 - intro.current) ** 3;
        camera.position.lerpVectors(from.current, desired.current, eased);
        controls.current?.target.lerp(look.current, 0.08);
        controls.current?.update();
      }
      return;
    }
    const shot = TOUR[Math.min(TOUR.length - 1, Math.max(0, tourIndex ?? 0))] ?? TOUR[0];
    if (!shot) return;
    desired.current.set(shot.pos[0] ?? 0, shot.pos[1] ?? 0, shot.pos[2] ?? 0);
    look.current.set(shot.target[0] ?? 0, shot.target[1] ?? 0, shot.target[2] ?? 0);
    camera.position.lerp(desired.current, 0.06);
    controls.current?.target.lerp(look.current, 0.06);
    controls.current?.update();
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      enabled={!touring && ready}
      autoRotate={autoOrbit && !touring && !stamp}
      autoRotateSpeed={0.35}
      minPolarAngle={0.82}
      maxPolarAngle={1.22}
      minDistance={7}
      maxDistance={28}
      target={[0, 0.6, 0]}
    />
  );
}
