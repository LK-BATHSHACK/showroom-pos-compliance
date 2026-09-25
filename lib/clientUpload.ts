"use client";

// Shared client-side helpers for the POS Check and H&S Check forms' photo
// uploads (25 Sep 2026 fix - Paul, Galway, couldn't submit his POS check).
//
// Why this exists: Vercel serverless functions reject any request body over
// 4.5MB with a plain-text 413 before our route code even runs. The forms
// allowed up to 10 photos per question at 5MB each and sent them all in one
// request, so any walkaround with a few full-size phone photos could never
// reach the server. On top of that the forms called res.json() on that
// plain-text error, which threw, so the button just stopped with no message.
//
// Fix: shrink every photo in the browser before sending (a 4MB phone photo
// becomes roughly 200-400KB at 1600px / JPEG 0.75, still plenty for spotting
// POS or H&S issues), check the total before sending, and always show a
// readable error whatever the server returns.

// Stay safely under Vercel's 4.5MB request-body cap once multipart overhead
// and the JSON payload are added.
export const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read image"));
    };
    img.src = url;
  });
}

/**
 * Resize + re-encode one photo as JPEG. Returns the original file untouched
 * if it isn't an image, the browser can't decode it (e.g. HEIC on some
 * Android/Windows browsers), or the "compressed" version would be bigger.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // PNG transparency -> white rather than black in JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function compressImages(files: File[]): Promise<File[]> {
  const out: File[] = [];
  // One at a time - decoding several 12MP photos in parallel can run older
  // phones out of memory.
  for (const f of files) out.push(await compressImage(f));
  return out;
}

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * POST a FormData and always come back with {ok, body}, never throw -
 * handles network failures, Vercel's plain-text 413/504 pages, and any
 * other non-JSON response, turning them into a message a store manager can
 * act on.
 */
export async function postFormData(url: string, formData: FormData): Promise<{ ok: boolean; body: any }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: formData });
  } catch {
    return { ok: false, body: { error: "Couldn't reach the server - check your internet connection and try again. Nothing has been lost, your answers are still here." } };
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok && body) return { ok: true, body };
  if (body?.error) return { ok: false, body };
  if (res.status === 413) {
    return { ok: false, body: { error: "Your photos are too large to send together - remove a few photos and try again." } };
  }
  if (res.status === 504) {
    return { ok: false, body: { error: "The server took too long to respond - please try again in a minute. If it keeps happening, remove a few photos and retry." } };
  }
  return { ok: false, body: { error: `Something went wrong (error ${res.status}) - please try again.` } };
}
