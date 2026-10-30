/** Hard ceiling on one PNG/JPEG image for explicitly verified vision models. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 1600;
export const MAX_IMAGE_PIXELS = 1200 * 1200;
// NVIDIA processor, revision 29dc69d: max_num_patches=13312 before 2x pixel shuffle.
// Reserve the entire pre-shuffle budget even for small images (which may be upscaled).
// https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-BF16/blob/29dc69d/image_processing_nemotron_h_omni.py
const IMAGE_TOKEN_BOUNDS: Readonly<Record<string, number>> = {
  "nvidia/Nemotron-3.5-Super-VL": 13312,
};
const IMAGE_FRAMING_TOKENS = 64;

/** Token ceiling for an image data URL, or null when it is not a PNG or JPEG inside the size bounds. */
export function imageTokenBound(dataUrl: string, model: string): number | null {
  if (!Object.hasOwn(IMAGE_TOKEN_BOUNDS, model)) return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return null;
  const bytes = Buffer.from(match[2], "base64");
  const size = match[1] === "png" ? pngSize(bytes) : jpegSize(bytes);
  if (!size) return null;
  const { width, height } = size;
  if (width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) return null;
  return IMAGE_TOKEN_BOUNDS[model] + IMAGE_FRAMING_TOKENS;
}

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature || bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    // Start-of-frame markers carry the dimensions (C4, C8 and CC are not frames).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}
