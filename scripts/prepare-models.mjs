import { mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";

const KEEP = new Set(["Idle", "Walking_A", "Running_A", "Interact", "Cheer", "Hit_A"]);
const CHAR_SRC = "/tmp/assets/chars";
const CITY_SRC = "/tmp/assets/city/KayKit-City-Builder-Bits-1.0-main/addons/kaykit_city_builder_bits/Assets/gltf";
const OUT = path.resolve("public/models");
const CITY_OUT = path.join(OUT, "city");

const CHARACTERS = [
  ["Knight.glb", "scout-inspector.glb"],
  ["Mage.glb", "scout-reader.glb"],
  ["Rogue.glb", "scout-seeker.glb"],
  ["Rogue_Hooded.glb", "scout-lens.glb"],
  ["Barbarian.glb", "scout-cartographer.glb"],
];

const CITY = [
  "building_A",
  "building_B",
  "building_C",
  "building_D",
  "building_E",
  "building_F",
  "building_G",
  "building_H",
  "streetlight",
  "bench",
  "bush",
  "car_taxi",
  "car_sedan",
  "watertower",
  "road_straight",
  "road_corner",
  "road_junction",
  "road_straight_crossing",
  "box_A",
  "firehydrant",
  "trafficlight_A",
  "dumpster",
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

await rm(OUT, { recursive: true, force: true });
await mkdir(CITY_OUT, { recursive: true });
await mkdir("public/draco", { recursive: true });
for (const file of ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]) {
  await copyFile(
    path.resolve("node_modules/three/examples/jsm/libs/draco/gltf", file),
    path.resolve("public/draco", file),
  );
}

for (const [sourceName, targetName] of CHARACTERS) {
  const document = await io.read(path.join(CHAR_SRC, sourceName));
  for (const animation of [...document.getRoot().listAnimations()]) {
    if (!KEEP.has(animation.getName())) {
      // Inputs are shared across clips. Disposing them here also strips the clips we keep.
      animation.dispose();
      continue;
    }
    for (const channel of [...animation.listChannels()]) {
      const nodeName = channel.getTargetNode()?.getName() ?? "";
      if (channel.getTargetPath() === "translation" && /^(root|hips|Rig)$/.test(nodeName)) channel.dispose();
    }
  }
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName() || "";
    if (/knife|crossbow|throwable|sword|bow|1H_|2H_/i.test(name)) node.setMesh(null);
  }
  await document.transform(prune(), dedup());
  const names = document.getRoot().listAnimations().map((item) => item.getName());
  for (const required of KEEP) {
    if (!names.includes(required)) throw new Error(`${sourceName} is missing ${required}`);
  }
  const target = path.join(OUT, targetName);
  await io.write(target, document);
  console.log(targetName, names.join(","));
}

for (const name of CITY) {
  const document = await io.read(path.join(CITY_SRC, `${name}.gltf`));
  await document.transform(prune(), dedup(), draco());
  const target = path.join(CITY_OUT, `${name}.glb`);
  await io.write(target, document);
  console.log("city", name);
}
