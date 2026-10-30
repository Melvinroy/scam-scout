"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { useWorld } from "@/lib/state/stores";

useGLTF.setDecoderPath("/draco/");

const URLS = {
  seeker: "/models/scout-seeker.glb",
  reader: "/models/scout-reader.glb",
  cartographer: "/models/scout-cartographer.glb",
  inspector: "/models/scout-inspector.glb",
  lens: "/models/scout-lens.glb",
  archivist: "/models/scout-reader.glb",
  dispatcher: "/models/scout-seeker.glb",
  clerk: "/models/scout-reader.glb",
  chief: "/models/scout-inspector.glb",
} as const;

const CARD_GEO = new THREE.BoxGeometry(0.22, 0.32, 0.03);
const CARD_MAT = new THREE.MeshStandardMaterial({ color: "#f6f1e6", emissive: "#e4c28a", emissiveIntensity: 0.45, roughness: 0.45 });
const TRAIL_GEO = new THREE.SphereGeometry(0.045, 8, 8);
const TRAIL_MAT = new THREE.MeshStandardMaterial({ color: "#e4c28a", emissive: "#e4c28a", emissiveIntensity: 1.6 });

function playClip(action: THREE.AnimationAction, once: boolean) {
  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.fadeIn(0.18).play();
}

export function ScoutMesh({
  job,
  phase,
  showCard = false,
  scale = 0.52,
}: {
  job: string;
  phase: string;
  showCard?: boolean;
  scale?: number;
}) {
  const url = URLS[job as keyof typeof URLS] ?? URLS.seeker;
  const gltf = useGLTF(url);
  const clone = useMemo(() => {
    const next = cloneSkeleton(gltf.scene) as THREE.Group;
    next.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (!("skeleton" in mesh) && /plane|shadow/i.test(mesh.name)) mesh.visible = false;
    });
    return next;
  }, [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, clone);
  const cardRef = useRef<THREE.Mesh | null>(null);

  useLayoutEffect(() => {
    const hand = clone.getObjectByName("handslot.r") ?? clone.getObjectByName("hand.r");
    if (!hand) return;
    const card = new THREE.Mesh(CARD_GEO, CARD_MAT);
    card.name = "evidence-card";
    card.position.set(0, 0.16, 0.06);
    card.castShadow = true;
    hand.add(card);
    cardRef.current = card;
    return () => {
      hand.remove(card);
      cardRef.current = null;
    };
  }, [clone]);

  useLayoutEffect(() => {
    const clip =
      phase === "walk" || phase === "carry" ? "Walking_A" :
      phase === "work" ? "Interact" :
      phase === "shrug" ? "Hit_A" :
      phase === "done" ? "Cheer" :
      "Idle";
    const next = actions[clip] ?? actions.Idle;
    if (!next) return;
    const once = phase === "shrug" || phase === "done";
    playClip(next, once);
    return () => {
      next.fadeOut(0.18);
    };
  }, [actions, phase]);

  useFrame(() => {
    if (cardRef.current) cardRef.current.visible = showCard;
  });

  return (
    <group scale={scale}>
      <primitive object={clone} position={[0, 1, 0]} />
    </group>
  );
}

export function FieldScouts() {
  const ids = useWorld((state) => state.world.actors.map((actor) => actor.callId).join("|"));
  return (
    <group>
      {ids.split("|").filter(Boolean).map((id) => (
        <MovingScout key={id} callId={id} />
      ))}
    </group>
  );
}

function MovingScout({ callId }: { callId: string }) {
  const ref = useRef<THREE.Group>(null);
  const crumbs = useRef<THREE.Vector3[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const trail = useRef<THREE.InstancedMesh>(null);
  const job = useWorld((state) => state.world.actors.find((item) => item.callId === callId)?.job ?? "seeker");
  const phase = useWorld((state) => state.world.actors.find((item) => item.callId === callId)?.phase ?? "walk");
  const showCard = useWorld((state) => {
    const actor = state.world.actors.find((item) => item.callId === callId);
    return Boolean(actor && (actor.phase === "carry" || actor.cards.length > 0));
  });

  useFrame(() => {
    const actor = useWorld.getState().world.actors.find((item) => item.callId === callId);
    if (!actor || !ref.current) return;
    ref.current.position.set(actor.position[0], actor.position[1], actor.position[2]);
    ref.current.rotation.y = actor.facing;
    if (actor.phase === "carry") {
      const last = crumbs.current[0];
      if (!last || last.distanceTo(ref.current.position) > 0.45) crumbs.current.unshift(ref.current.position.clone());
      crumbs.current.length = 10;
    }
    const mesh = trail.current;
    if (!mesh) return;
    crumbs.current.forEach((point, index) => {
      dummy.position.set(point.x, 0.08, point.z);
      dummy.scale.setScalar(1 - index / 12);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    for (let index = crumbs.current.length; index < 10; index += 1) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <group
        ref={ref}
        onClick={(event) => {
          event.stopPropagation();
          useWorld.getState().select(callId);
        }}
      >
        <ScoutMesh job={job} phase={phase} showCard={showCard} />
      </group>
      <instancedMesh ref={trail} args={[TRAIL_GEO, TRAIL_MAT, 10]} />
    </group>
  );
}

export function DeskStaff() {
  const stamp = useWorld((state) => state.world.stamp);
  const celebrate = useWorld((state) => state.world.celebrate);
  return (
    <group>
      <group position={[-0.85, 0, 1.45]} rotation={[0, 2.4, 0]}>
        <ScoutMesh job="dispatcher" phase="work" scale={0.48} />
      </group>
      <group position={[0.15, 0, 1.7]} rotation={[0, Math.PI, 0]}>
        <ScoutMesh job="clerk" phase="work" scale={0.48} />
      </group>
      <group position={[0.95, 0, 1.4]} rotation={[0, -2.6, 0]}>
        <ScoutMesh job="chief" phase={celebrate || stamp ? "done" : "work"} scale={0.62} />
      </group>
    </group>
  );
}

for (const url of new Set(Object.values(URLS))) useGLTF.preload(url);
