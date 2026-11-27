import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "./config.js";

// Firebase Auth signs ID tokens with Google's rotating keys; jose fetches and
// caches them. Checking issuer + audience pins tokens to our Firebase project.
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type AuthedLocals = { uid: string };

// Requires "Authorization: Bearer <Firebase ID token>" and exposes the
// caller's uid as res.locals.uid.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      issuer: `https://securetoken.google.com/${config.firebaseProjectId}`,
      audience: config.firebaseProjectId,
    });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("no subject");
    res.locals.uid = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
};
