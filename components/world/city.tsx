"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EDGES, WAYPOINTS } from "@/lib/choreo/waypoints";
import { useWorld } from "@/lib/state/stores";

useGLTF.setDecoderPath("/draco/");

const CITY = [
  "building_A", "building_B", "building_C", "building_D", "building_E", "building_F", "building_G", "building_H",
  "streetlight", "bench", "bush", "car_taxi", "car_sedan", "watertower",
  "road_straight", "road_corner", "road_junction", "road_straight_crossing",
  "box_A", "firehydrant", "trafficlight_A", "dumpster",
] as const;

function Kit({ name, position, rotation = 0, scale = 1 }: { name: (typeof CITY)[number]; position: [number, number, number]; rotation?: number; scale?: number }) {
  const gltf = useGLTF(`/models/city/${name}.glb`);
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  useLayoutEffect(() => {
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [clone]);
  return <primitive object={clone} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}

const ISLANDS: Array<{ id: string; model: (typeof CITY)[number]; rotation: number; scale?: number; sign: string }> = [
  { id: "hq", model: "building_H", rotation: 0.2, scale: 1.05, sign: "HQ" },
  { id: "newsstand", model: "building_B", rotation: 0.9, sign: "News" },
  { id: "regulator", model: "building_G", rotation: -0.4, scale: 1.08, sign: "Alerts" },
  { id: "shop", model: "building_C", rotation: 2.4, sign: "Shop" },
  { id: "sitemap", model: "building_A", rotation: 1.2, sign: "Map" },
  { id: "clones", model: "building_E", rotation: -1.4, scale: 0.86, sign: "Copies" },
  { id: "photolab", model: "building_F", rotation: 0.5, sign: "Photo" },
  { id: "records", model: "building_D", rotation: -2.2, sign: "Payee" },
];

export function City() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color="#1a1814" roughness={1} />
      </mesh>
      <Roads />
      {ISLANDS.map((island) => {
        const at = WAYPOINTS[island.id] ?? [0, 0, 0];
        return (
          <group key={island.id} position={at} onClick={(event) => { event.stopPropagation(); useWorld.getState().select(island.id); }}>
            <Kit name={island.model} position={[0, 0, 0]} rotation={island.rotation} scale={island.scale ?? 0.92} />
            <Sign label={island.id === "shop" ? undefined : island.sign} fallback={island.sign} />
          </group>
        );
      })}
      <Dressing />
      <Beacon />
      <CaseFile />
      <Stamp />
    </group>
  );
}

function Roads() {
  return (
    <group>
      <Kit name="road_junction" position={[0, -0.02, 0]} scale={1.15} />
      {EDGES.map(([a, b]) => {
        const start = WAYPOINTS[a] ?? [0, 0, 0];
        const end = WAYPOINTS[b] ?? [0, 0, 0];
        const mid: [number, number, number] = [(start[0] + end[0]) / 2, -0.02, (start[2] + end[2]) / 2];
        const rotation = Math.atan2(end[0] - start[0], end[2] - start[2]);
        return <Kit key={`${a}-${b}`} name="road_straight" position={mid} rotation={rotation} />;
      })}
    </group>
  );
}

function Dressing() {
  const shop = WAYPOINTS.shop ?? [0, 0, 0];
  const news = WAYPOINTS.newsstand ?? [0, 0, 0];
  const reg = WAYPOINTS.regulator ?? [0, 0, 0];
  const records = WAYPOINTS.records ?? [0, 0, 0];
  const clones = WAYPOINTS.clones ?? [0, 0, 0];
  const photo = WAYPOINTS.photolab ?? [0, 0, 0];
  return (
    <group>
      <Kit name="watertower" position={[reg[0] - 1.5, 0, reg[2] - 1.2]} scale={1.1} />
      <Kit name="bench" position={[news[0] + 1.3, 0, news[2] + 0.4]} rotation={0.8} />
      <Kit name="car_taxi" position={[shop[0] + 1.6, 0, shop[2] + 1.1]} rotation={-0.6} scale={0.9} />
      <Kit name="car_sedan" position={[clones[0] - 1.5, 0, clones[2] + 1.2]} rotation={1.4} scale={0.9} />
      <Kit name="dumpster" position={[clones[0] + 1.2, 0, clones[2] - 0.8]} rotation={0.4} />
      <Kit name="firehydrant" position={[shop[0] - 1.3, 0, shop[2] + 0.2]} />
      <Kit name="trafficlight_A" position={[3.2, 0, -1.4]} rotation={0.4} />
      <Kit name="box_A" position={[records[0] + 1.15, 0, records[2] - 0.2]} rotation={0.3} />
      <Kit name="streetlight" position={[-2.2, 0, -1.6]} />
      <Kit name="streetlight" position={[2.4, 0, 1.8]} rotation={1} />
      <Kit name="streetlight" position={[photo[0] + 1.4, 0, photo[2] + 1]} />
      <Kit name="bush" position={[-1.6, 0, 1.5]} />
      <Kit name="bush" position={[1.4, 0, -1.2]} scale={0.8} />
      <Kit name="bush" position={[news[0] - 1.2, 0, news[2] - 0.8]} />
      <Kit name="bush" position={[records[0] - 1.1, 0, records[2] + 0.9]} scale={1.1} />
    </group>
  );
}

function Sign({ label, fallback }: { label?: string; fallback: string }) {
  const shop = useWorld((state) => state.world.label);
  const text = (label ?? (shop || fallback)).slice(0, 18);
  return (
    <Html position={[0, 2.2, 0]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
      <div className="sign">{text}</div>
    </Html>
  );
}

function Beacon() {
  const beacon = useWorld((state) => state.world.reactions.regulator?.beacon);
  const at = WAYPOINTS.regulator ?? [0, 0, 0];
  const color = beacon === "red" ? "#e56b78" : beacon === "green" ? "#7dcea0" : "#8d8478";
  return (
    <group position={[at[0], 2.05, at[2]]}>
      <mesh>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={beacon ? 2.4 : 0.25} />
      </mesh>
      {beacon ? <pointLight color={color} intensity={18} distance={6} /> : null}
    </group>
  );
}

function CaseFile() {
  const count = useWorld((state) => state.world.actors.filter((actor) => actor.phase === "done" && actor.cards.length > 0).length);
  const sheets = Math.max(1, Math.min(6, count));
  return (
    <group position={[0.05, 0.02, 1.15]}>
      {Array.from({ length: sheets }, (_, index) => (
        <mesh key={index} position={[index * 0.03, 0.04 + index * 0.025, index * 0.02]} rotation={[-Math.PI / 2, 0, index * 0.08]} castShadow>
          <boxGeometry args={[0.42, 0.58, 0.012]} />
          <meshStandardMaterial color={index === sheets - 1 ? "#f4efe4" : "#e7dcc8"} />
        </mesh>
      ))}
    </group>
  );
}

function Stamp() {
  const level = useWorld((state) => state.world.stamp);
  const ref = useRef<THREE.Group>(null);
  const dropped = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    dropped.current = Math.min(1, dropped.current + dt * (level ? 2.4 : 0));
    const eased = 1 - (1 - dropped.current) ** 3;
    ref.current.position.y = 1.8 - eased * 0.95;
    ref.current.scale.setScalar(0.7 + eased * 0.3);
    ref.current.visible = Boolean(level);
  });
  const color = level === "High" ? "#e56b78" : level === "Medium" ? "#e2b15a" : "#7dcea0";
  return (
    <group ref={ref} position={[0.42, 1.8, 1.25]} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, -0.4]}>
        <boxGeometry args={[0.46, 0.28, 0.03]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

for (const name of CITY) useGLTF.preload(`/models/city/${name}.glb`);
