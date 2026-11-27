import { Router } from "express";
import { config } from "../config.js";

// Web landing page for an invite link: https://api.instereo.app/invite/<id>
//
// The app used to share instereo://invite/<id>, which only works when inStereo
// is already installed and many messengers won't even make it tappable. An
// https link always opens; this page then hands off to the app, or explains
// how to get it.

const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${config.firebaseProjectId}/databases/(default)/documents`;

type InviteInfo = { name: string; photoUrl: string; city: string; status: string; expired: boolean };

// Invites are publicly readable by design (firestore.rules: allow get: if true)
// so the person invited can see who it's from before signing in.
async function loadInvite(id: string): Promise<InviteInfo | null> {
  const res = await fetch(`${FIRESTORE}/invites/${id}`);
  if (!res.ok) return null;
  const doc = (await res.json()) as { fields?: Record<string, any> };
  const f = doc.fields ?? {};
  const profile = f.creatorProfile?.mapValue?.fields ?? {};
  const expiresAt = f.expiresAt?.timestampValue ? Date.parse(f.expiresAt.timestampValue) : Infinity;
  return {
    name: profile.name?.stringValue || "Someone",
    photoUrl: profile.photoUrl?.stringValue || "",
    city: profile.city?.stringValue || "",
    status: f.status?.stringValue || "pending",
    expired: expiresAt < Date.now(),
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(id: string, invite: InviteInfo | null): string {
  const appLink = `instereo://invite/${id}`;
  const name = esc(invite?.name ?? "Someone");
  const first = esc((invite?.name ?? "Someone").split(/\s+/)[0]);
  const usable = invite && invite.status === "pending" && !invite.expired;
  const photo = invite?.photoUrl?.startsWith("https://")
    ? `<img class="avatar" src="${esc(invite.photoUrl)}" alt="">`
    : `<div class="avatar initial">${esc((invite?.name ?? "?").charAt(0).toUpperCase())}</div>`;
  const testflight = process.env.TESTFLIGHT_URL;

  const body = !invite
    ? `<h1>This invite link doesn't work.</h1><p>Ask the person who sent it for a new one.</p>`
    : !usable
      ? `<h1>This invite has ${invite.status === "used" ? "already been used" : "expired"}.</h1><p>Ask ${first} to send you a new link from inStereo.</p>`
      : `${photo}
         <p class="eyebrow">YOU'RE INVITED</p>
         <h1>${name} wants to stay close on inStereo.</h1>
         <p>${invite.city ? `See ${first}'s local time and weather in ${esc(invite.city)}, ` : "See each other's local time and weather, "}check in, and chat.</p>
         <a class="btn" href="${appLink}">Open in inStereo</a>
         <div class="note">
           <strong>Don't have inStereo yet?</strong>
           ${testflight
             ? `It's in early testing. <a href="${esc(testflight)}">Get it on TestFlight</a>, then come back and tap <em>Open in inStereo</em>.`
             : `It's in early testing on iPhone. Ask ${first} to add you on TestFlight, install it, then come back to this link and tap <em>Open in inStereo</em>.`}
         </div>`;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${usable ? `${name} invited you to inStereo` : "inStereo invite"}</title>
<meta property="og:title" content="${usable ? `${name} invited you to inStereo` : "inStereo"}">
<meta property="og:description" content="Everyone is better in stereo.">
<style>
  body{margin:0;background:#F4F4EF;color:#23282A;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;display:flex;justify-content:center}
  main{max-width:420px;padding:56px 24px;text-align:center}
  .logo{display:inline-flex;gap:5px;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:#23282A;margin-bottom:28px}
  .logo i{display:block;width:5px;border-radius:3px;background:#fff}
  .avatar{width:88px;height:88px;border-radius:50%;object-fit:cover;border:4px solid #fff;box-shadow:0 4px 16px rgba(35,40,42,.12)}
  .initial{display:inline-flex;align-items:center;justify-content:center;background:#DCDDD6;font:500 36px Georgia,serif}
  .eyebrow{letter-spacing:.14em;font-size:12px;font-weight:600;color:#8A908B;margin:24px 0 6px}
  h1{font:500 32px/1.15 Georgia,"Times New Roman",serif;letter-spacing:-.02em;margin:0 0 12px}
  p{color:#5F6661;margin:0 0 24px}
  .btn{display:block;background:#3F4B43;color:#fff;text-decoration:none;font-weight:600;padding:16px;border-radius:999px;margin:8px 0 24px}
  .note{background:#FBFBF8;border:1px solid #DCDDD6;border-radius:18px;padding:16px;font-size:14px;color:#5F6661;text-align:left}
  .note a{color:#3F4B43}
</style></head>
<body><main>
  <div class="logo"><i style="height:14px"></i><i style="height:24px"></i><i style="height:14px"></i></div>
  ${body}
</main></body></html>`;
}

export const inviteRouter = Router();

inviteRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  // Firestore auto-IDs are 20 alphanumeric characters.
  const invite = /^[A-Za-z0-9]{10,40}$/.test(id) ? await loadInvite(id).catch(() => null) : null;
  res.setHeader("Cache-Control", "no-store");
  res.status(invite ? 200 : 404).type("html").send(page(id.replace(/[^A-Za-z0-9]/g, ""), invite));
});
