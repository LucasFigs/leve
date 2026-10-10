// GERADO por `npm run setup:push` a partir de source.ts — não edite à mão.
// @ts-nocheck
// src/domain/dates.ts
var pad = (n) => String(n).padStart(2, "0");
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function diffDays(a, b) {
  return Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / 864e5);
}
function weekdayOf(iso) {
  return fromISODate(iso).getDay();
}
function startOfWeek(iso) {
  const wd = weekdayOf(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}
function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// src/domain/recurrence.ts
var freqOf = (r) => r.freq === "interval" ? "daily" : r.freq;
var intervalOf = (r) => Math.max(1, Math.floor(r.interval ?? 1) || 1);
var lastDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
function dayMatches(r, d, anchor) {
  if (r.nth != null && r.weekday != null) {
    if (d.getDay() !== r.weekday) return false;
    return r.nth < 0 ? d.getDate() + 7 > lastDayOfMonth(d) : Math.ceil(d.getDate() / 7) === r.nth;
  }
  return d.getDate() === Math.min(r.monthDay ?? anchor.getDate(), lastDayOfMonth(d));
}
function matchesRule(r, date) {
  if (date < r.anchor) return false;
  if (r.until && date > r.until) return false;
  const n = intervalOf(r);
  const d = fromISODate(date);
  const a = fromISODate(r.anchor);
  switch (freqOf(r)) {
    case "daily":
      return diffDays(date, r.anchor) % n === 0;
    case "weekly": {
      const days = r.weekdays?.length ? r.weekdays : [a.getDay()];
      if (!days.includes(d.getDay())) return false;
      return diffDays(startOfWeek(date), startOfWeek(r.anchor)) / 7 % n === 0;
    }
    case "monthly": {
      const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth();
      return months % n === 0 && dayMatches(r, d, a);
    }
    case "yearly": {
      if ((d.getFullYear() - a.getFullYear()) % n !== 0) return false;
      return d.getMonth() === (r.month ?? a.getMonth()) && dayMatches(r, d, a);
    }
  }
}
var lastByCount = /* @__PURE__ */ new WeakMap();
function lastOccurrence(r) {
  const cached = lastByCount.get(r);
  if (cached) return cached;
  let left = Math.max(1, r.count ?? 1);
  let cursor = r.anchor;
  let last = r.anchor;
  for (let i = 0; i < 366 * 60 && left > 0; i++, cursor = addDays(cursor, 1)) {
    if (matchesRule(r, cursor)) {
      last = cursor;
      left--;
    }
  }
  lastByCount.set(r, last);
  return last;
}
function occursOn(r, date) {
  if (!matchesRule(r, date)) return false;
  return !r.count || date <= lastOccurrence(r);
}

// src/domain/selectors.ts
function durationOf(t, fallback = 30) {
  return t.duration ?? fallback;
}
function itemsForDate(tasks, date, fallback = 30) {
  const out = [];
  for (const t of tasks) {
    if (t.status === "archived" || t.status === "inbox") continue;
    if (t.recurrence) {
      if (!occursOn(t.recurrence, date) || t.skipDates?.includes(date)) continue;
      out.push({
        task: t,
        date,
        time: t.time,
        duration: durationOf(t, fallback),
        done: !!t.doneDates?.includes(date) || !!t.missedDates?.includes(date),
        missed: !!t.missedDates?.includes(date),
        recurring: true
      });
    } else if (t.date === date) {
      out.push({ task: t, date, time: t.time, duration: durationOf(t, fallback), done: t.status === "done", missed: t.status === "done" && !!t.missed, recurring: false });
    }
  }
  return sortItems(out);
}
function sortItems(items) {
  return items.sort((a, b) => {
    if (a.time && b.time) return timeToMin(a.time) - timeToMin(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.task.createdAt - b.task.createdAt;
  });
}

// src/domain/reminders.ts
function dueReminders(tasks, prefs, today, now, grace = 5) {
  const lead = prefs.reminderLead ?? 10;
  const out = [];
  for (const i of itemsForDate(tasks, today, prefs.defaultDuration ?? 30)) {
    if (!i.time || i.done) continue;
    const start = timeToMin(i.time);
    if (now < start - lead || now > start + grace) continue;
    const left = start - now;
    out.push({
      key: `${i.task.id}:${i.time}`,
      taskId: i.task.id,
      date: i.date,
      time: i.time,
      title: i.task.title,
      left,
      body: left > 0 ? `Come\xE7a \xE0s ${i.time} (em ${left} min)` : `Era \xE0s ${i.time} \u2014 est\xE1 na hora`
    });
  }
  return out;
}

// supabase/functions/send-reminders/webpush.ts
var enc = new TextEncoder();
function b64urlDecode(s) {
  const pad2 = "=".repeat((4 - s.length % 4) % 4);
  const bin = atob((s + pad2).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}
async function encryptPayload(sub, payload) {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(enc.encode(payload), new Uint8Array([2]))));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, cipher);
}
async function vapidAuthorization(endpoint, vapid, now = Date.now()) {
  const pub = b64urlDecode(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)) },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1e3) + 12 * 3600, sub: vapid.subject })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}
async function sendPush(sub, payload, vapid, ttlSeconds = 900) {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high",
      Authorization: await vapidAuthorization(sub.endpoint, vapid)
    },
    body: await encryptPayload(sub, payload)
  });
  return res.status;
}

// supabase/functions/send-reminders/source.ts
function localNow(tz, at = /* @__PURE__ */ new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(at).map((p) => [p.type, p.value])
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, now: Number(parts.hour) * 60 + Number(parts.minute) };
}
async function run(env, at = /* @__PURE__ */ new Date()) {
  const rest = (path, init = {}) => fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...init.headers ?? {} }
  });
  const subs = await (await rest("push_subscriptions?select=*&order=updated_at.desc")).json();
  const byUser = /* @__PURE__ */ new Map();
  for (const s of Array.isArray(subs) ? subs : []) byUser.set(s.user_id, [...byUser.get(s.user_id) ?? [], s]);
  let sent = 0;
  let removed = 0;
  for (const [userId, devices] of byUser) {
    const rows = await (await rest(`records?user_id=eq.${userId}&type=in.(task,meta)&select=id,type,data`)).json();
    if (!Array.isArray(rows)) continue;
    const meta = rows.find((r) => r.type === "meta")?.data;
    if (!meta?.settings?.reminders) continue;
    const tasks = rows.filter((r) => r.type === "task").map((r) => r.data);
    const { today, now } = localNow(devices[0].tz || "America/Sao_Paulo", at);
    for (const r of dueReminders(tasks, meta.settings, today, now)) {
      const mark = await rest("push_sent", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, key: `${today}:${r.key}` })
      });
      if (!mark.ok) continue;
      const payload = JSON.stringify({ title: r.title, body: r.body, tag: r.key, data: { taskId: r.taskId, date: r.date } });
      for (const d of devices) {
        const status = await sendPush(d, payload, env.vapid).catch(() => 0);
        if (status === 404 || status === 410) {
          await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(d.endpoint)}`, { method: "DELETE" });
          removed++;
        } else if (status >= 200 && status < 300) sent++;
      }
    }
  }
  if (at.getUTCMinutes() === 0) {
    await rest(`push_sent?sent_at=lt.${new Date(at.getTime() - 2 * 864e5).toISOString()}`, { method: "DELETE" });
  }
  return { users: byUser.size, sent, removed };
}
if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
    try {
      const result = await run({
        supabaseUrl: Deno.env.get("SUPABASE_URL"),
        serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        vapid: {
          publicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
          privateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
          subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@example.com"
        }
      });
      return Response.json(result);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  });
}
export {
  localNow,
  run
};
