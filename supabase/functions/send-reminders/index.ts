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
function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" || host === "wns.windows.com" || host.endsWith(".wns.windows.com"));
  } catch {
    return false;
  }
}
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
  if (!isAllowedPushEndpoint(sub.endpoint)) throw new Error("Destino push n\xE3o permitido.");
  if (b64urlDecode(sub.p256dh).length !== 65 || b64urlDecode(sub.auth).length !== 16) throw new Error("Inscri\xE7\xE3o inv\xE1lida.");
  if (enc.encode(payload).length > 3500) throw new Error("Notifica\xE7\xE3o muito grande.");
  const res = await fetch(sub.endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(5e3),
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high",
      Authorization: await vapidAuthorization(sub.endpoint, vapid)
    },
    body: await encryptPayload(sub, payload)
  });
  const status = res.status;
  await res.body?.cancel();
  return status;
}

// src/domain/validation.ts
var isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var text = (v, max) => typeof v === "string" && v.length <= max;
var number = (v) => typeof v === "number" && Number.isFinite(v);
var optional = (v, check) => v == null || check(v);
var isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
var time = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
var dates = (v) => Array.isArray(v) && v.length <= 25e3 && v.every(isDate);
var integer = (v, low, high) => number(v) && Number.isInteger(v) && v >= low && v <= high;
function isTask(v) {
  if (!isObject(v) || !text(v.id, 200) || !v.id || !text(v.title, 1e3) || !["task", "event", "habit"].includes(v.kind) || !["inbox", "active", "done", "archived"].includes(v.status) || !number(v.createdAt) || !number(v.updatedAt) || !number(v.postponed) || !optional(v.notes, (x) => text(x, 5e4)) || !optional(v.date, isDate) || !optional(v.due, isDate) || !optional(v.time, time) || !optional(v.duration, (x) => integer(x, 1, 10080)) || !optional(v.googleEventId, (x) => text(x, 1024)) || !optional(v.doneDates, dates) || !optional(v.skipDates, dates) || !optional(v.missedDates, dates) || !Array.isArray(v.subtasks) || v.subtasks.length > 1e3 || !v.subtasks.every((s) => isObject(s) && text(s.id, 200) && text(s.title, 1e3) && typeof s.done === "boolean")) return false;
  if (v.recurrence != null) {
    const r = v.recurrence;
    if (!isObject(r) || !["daily", "weekly", "monthly", "yearly", "interval"].includes(r.freq) || !isDate(r.anchor) || !optional(r.until, isDate) || !optional(r.interval, (x) => integer(x, 1, 1e4)) || !optional(r.count, (x) => integer(x, 1, 25e3)) || !optional(r.weekdays, (x) => Array.isArray(x) && x.length <= 7 && x.every((d) => integer(d, 0, 6))) || !optional(r.monthDay, (x) => integer(x, 1, 31)) || !optional(r.month, (x) => integer(x, 0, 11)) || !optional(r.weekday, (x) => integer(x, 0, 6)) || !optional(r.nth, (x) => x === -1 || integer(x, 1, 5))) return false;
  }
  return true;
}
function isSettings(v) {
  if (!isObject(v)) return false;
  return optional(v.name, (x) => text(x, 1e3)) && optional(v.theme, (x) => ["system", "light", "dark"].includes(x)) && ["dayStart", "dayEnd", "lunchStart", "lunchEnd"].every((k) => optional(v[k], time)) && optional(v.defaultDuration, (x) => integer(x, 1, 10080)) && optional(v.reminderLead, (x) => integer(x, 0, 1440)) && ["protectLunch", "nudges", "reminders", "onboarded"].every((k) => optional(v[k], (x) => typeof x === "boolean"));
}
function isMeta(v) {
  return isObject(v) && isSettings(v.settings) && optional(v.dismissed, (x) => isObject(x) && Object.values(x).every(isDate)) && optional(v.focus, (x) => isObject(x) && text(x.taskId, 200) && isDate(x.date) && number(x.startedAt) && number(x.elapsedBefore) && typeof x.running === "boolean");
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
    signal: AbortSignal.timeout(5e3),
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...init.headers ?? {} }
  });
  const readRows = async (path) => {
    const all = [];
    for (let offset = 0; offset < 1e5; offset += 500) {
      const res = await rest(`${path}&limit=500&offset=${offset}`);
      if (!res.ok) throw new Error("Falha ao consultar lembretes.");
      const page = await res.json();
      if (!Array.isArray(page)) throw new Error("Resposta inv\xE1lida.");
      all.push(...page);
      if (page.length < 500) return all;
    }
    throw new Error("Limite de processamento excedido.");
  };
  const subs = await readRows("push_subscriptions?select=*&order=endpoint.asc");
  const byUser = /* @__PURE__ */ new Map();
  for (const s of subs) {
    if (typeof s.user_id !== "string") continue;
    const devices = byUser.get(s.user_id) ?? [];
    if (devices.length < 10) devices.push(s);
    byUser.set(s.user_id, devices);
  }
  let sent = 0;
  let removed = 0;
  for (const [userId, devices] of byUser) {
    try {
      devices.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      const rows = await readRows(`records?user_id=eq.${encodeURIComponent(userId)}&type=in.(task,meta)&select=id,type,data&order=id.asc`);
      if (!Array.isArray(rows)) continue;
      const rawMeta = rows.find((r) => r.id === "meta" && r.type === "meta")?.data;
      if (!isMeta(rawMeta)) continue;
      const meta = rawMeta;
      if (!meta?.settings?.reminders) continue;
      const tasks = rows.filter((r) => r.type === "task").map((r) => r.data).filter(isTask);
      const { today, now } = localNow(devices[0].tz || "America/Sao_Paulo", at);
      for (const r of dueReminders(tasks, meta.settings, today, now)) {
        const payload = JSON.stringify({ title: [...r.title].slice(0, 180).join(""), body: r.body, tag: r.key, data: { taskId: r.taskId, date: r.date } });
        for (const d of devices) {
          if (!isAllowedPushEndpoint(d.endpoint)) continue;
          const deviceKey = b64urlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(d.endpoint))));
          const key = `${today}:${r.key}:${deviceKey}`;
          const mark = await rest("push_sent", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ user_id: userId, key })
          });
          if (!mark.ok) continue;
          const status = await sendPush(d, payload, env.vapid).catch(() => 0);
          if (status === 404 || status === 410) {
            await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(d.endpoint)}`, { method: "DELETE" });
            removed++;
          } else if (status >= 200 && status < 300) sent++;
          if (status === 0 || status === 429 || status >= 500) {
            await rest(`push_sent?user_id=eq.${encodeURIComponent(userId)}&key=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
          }
        }
      }
    } catch {
      console.warn("N\xE3o foi poss\xEDvel processar um grupo de lembretes.");
    }
  }
  if (at.getUTCMinutes() === 0) {
    await rest(`push_sent?sent_at=lt.${new Date(at.getTime() - 2 * 864e5).toISOString()}`, { method: "DELETE" });
  }
  return { users: byUser.size, sent, removed };
}
async function validCronSecret(actual, expected) {
  if (!actual || !expected || expected.length < 32 || actual.length > 256) return false;
  const digest = (s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
var running = false;
var lastRun = 0;
async function handleRequest(req, secret, env) {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { Allow: "POST" } });
  if (!await validCronSecret(req.headers.get("x-cron-secret"), secret)) return new Response("forbidden", { status: 403 });
  if (running || Date.now() - lastRun < 3e4) return new Response("busy", { status: 429 });
  running = true;
  lastRun = Date.now();
  try {
    return Response.json(await run(env()));
  } catch {
    return Response.json({ error: "Falha ao processar lembretes." }, { status: 500 });
  } finally {
    running = false;
  }
}
if (typeof Deno !== "undefined") {
  Deno.serve((req) => handleRequest(req, Deno.env.get("CRON_SECRET"), () => ({
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    vapid: {
      publicKey: Deno.env.get("VAPID_PUBLIC_KEY"),
      privateKey: Deno.env.get("VAPID_PRIVATE_KEY"),
      subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@example.com"
    }
  })));
}
export {
  handleRequest,
  localNow,
  run,
  validCronSecret
};
