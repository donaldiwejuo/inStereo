// All settings come from environment variables: a local .env file in
// development, Fly.io secrets in production. Failing fast here beats a
// confusing crash later when something tries to use a missing value.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// Media storage (Cloudflare R2) is optional so the server still boots without
// it; the upload endpoint answers 503 until all of these are set.
function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.MEDIA_PUBLIC_URL; // e.g. https://media.instereo.app
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/$/, "") };
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  isProduction: process.env.NODE_ENV === "production",
  // The app still signs people in with Firebase Auth; we verify its ID
  // tokens until our own email-code login replaces it.
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "ensemble-7e6bd",
  r2: r2Config(),
};
