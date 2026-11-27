import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";

// Media never passes through this server. The app asks for a short-lived
// signed upload URL, PUTs the file straight to Cloudflare R2, then stores the
// returned public URL (in a chat message or as a photo).

const KINDS = {
  image: { prefix: "chat", types: { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" } },
  video: { prefix: "chat", types: { "video/mp4": "mp4", "video/quicktime": "mov" } },
  audio: { prefix: "chat", types: { "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac" } },
  photo: { prefix: "photos", types: { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" } },
} as const;
type Kind = keyof typeof KINDS;

const UPLOAD_URL_TTL_SECONDS = 300;

const r2 = config.r2;
const s3 = r2
  ? new S3Client({
      region: "auto",
      endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
      // Otherwise the SDK bakes a checksum of an *empty* body into the signed
      // URL, and R2 rejects the real upload as a mismatch.
      requestChecksumCalculation: "WHEN_REQUIRED",
    })
  : null;

export const mediaRouter = Router();

// POST /media/uploads { kind, contentType, chatId? }
//   → { uploadUrl, publicUrl, headers }
mediaRouter.post("/uploads", requireAuth, async (req, res) => {
  if (!r2 || !s3) {
    res.status(503).json({ error: "media_not_configured" });
    return;
  }
  const uid: string = res.locals.uid;
  const { kind, contentType, chatId } = req.body ?? {};

  if (typeof kind !== "string" || !(kind in KINDS)) {
    res.status(400).json({ error: "invalid_kind" });
    return;
  }
  const spec = KINDS[kind as Kind];
  const ext = (spec.types as Record<string, string>)[contentType];
  if (!ext) {
    res.status(400).json({ error: "unsupported_content_type" });
    return;
  }

  let key: string;
  if (spec.prefix === "chat") {
    // Same membership rule as the chat itself: chatId is "<uidA>_<uidB>".
    if (typeof chatId !== "string" || !chatId.split("_").includes(uid)) {
      res.status(403).json({ error: "not_in_chat" });
      return;
    }
    key = `chat/${chatId}/${randomUUID()}.${ext}`;
  } else {
    key = `photos/${uid}/${randomUUID()}.${ext}`;
  }

  // Random, unguessable keys: the public URL is only known to the people the
  // app shares it with (same model as Firebase Storage download URLs).
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
  res.json({ uploadUrl, publicUrl: `${r2.publicUrl}/${key}`, headers: { "Content-Type": contentType } });
});
