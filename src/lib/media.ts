import { auth } from "../config/firebase";

// Our own API (server/ in this repo, deployed on Fly.io).
export const API_URL = "https://api.instereo.app";

export type MediaKind = "image" | "video" | "audio" | "photo";

const DEFAULT_TYPES: Record<MediaKind, string> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/mp4",
  photo: "image/jpeg",
};

export class MediaUploadError extends Error {}

// Uploads a local file (file:// URI from the picker or recorder) to
// Cloudflare R2 and returns its public https:// URL:
//   1. ask our server for a short-lived signed upload URL (proves who we are
//      with the Firebase ID token),
//   2. PUT the file straight to R2 — it never passes through our server.
export async function uploadMedia(
  localUri: string,
  kind: MediaKind,
  opts: { chatId?: string; contentType?: string | null } = {},
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new MediaUploadError("Not signed in");
  const contentType = opts.contentType || DEFAULT_TYPES[kind];

  const res = await fetch(`${API_URL}/media/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ kind, contentType, chatId: opts.chatId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MediaUploadError(`Upload not allowed (${res.status} ${body.error ?? ""})`.trim());
  }
  const { uploadUrl, publicUrl, headers } = (await res.json()) as {
    uploadUrl: string;
    publicUrl: string;
    headers: Record<string, string>;
  };

  const file = await (await fetch(localUri)).blob();
  await putBlob(uploadUrl, file, headers);
  return publicUrl;
}

// XMLHttpRequest rather than fetch: React Native's XHR sends a Blob body
// natively, which is the most reliable way to stream a large video.
function putBlob(url: string, blob: Blob, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new MediaUploadError(`Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () => reject(new MediaUploadError("Network error while uploading"));
    xhr.send(blob);
  });
}
