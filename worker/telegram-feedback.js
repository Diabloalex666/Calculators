// Cloudflare Worker: FinPulse feedback → Telegram
// Hardening: CORS allowlist, body limits, sanitize, IP rate-limit (Cache API)

const ALLOWED_ORIGINS = ["https://finraz.ru", "https://www.finraz.ru"];
const MAX_MESSAGE = 2000;
const MAX_CONTACT = 120;
const MAX_BODY_BYTES = 8_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;

    const corsHeaders = {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    };
    if (corsOrigin) {
      corsHeaders["Access-Control-Allow-Origin"] = corsOrigin;
      corsHeaders["Vary"] = "Origin";
    }

    if (request.method === "OPTIONS") {
      if (!corsOrigin) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return text("Method not allowed", 405, corsHeaders);
    }

    // POST without allowed Origin (or non-browser) — reject
    if (!corsOrigin) {
      return json({ ok: false, error: "forbidden origin" }, 403, corsHeaders);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
      "unknown";

    const limited = await isRateLimited(ip);
    if (limited) {
      return json({ ok: false, error: "rate limit" }, 429, {
        ...corsHeaders,
        "Retry-After": "60",
      });
    }

    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload too large" }, 413, corsHeaders);
    }

    try {
      const body = await request.json();
      const message = sanitize(body.message, MAX_MESSAGE);
      const contact = sanitize(body.contact, MAX_CONTACT);
      const page = sanitizePage(body.page);

      if (message.length < 5) {
        return json({ ok: false, error: "message too short" }, 400, corsHeaders);
      }

      if ((message.match(/https?:\/\//gi) || []).length > 5) {
        return json({ ok: false, error: "too many links" }, 400, corsHeaders);
      }

      const textMsg = [
        "FinPulse feedback",
        "",
        `Page: ${page}`,
        `Message: ${message}`,
        `Contact: ${contact || "—"}`,
        `IP: ${ip}`,
      ].join("\n");

      if (!env.BOT_TOKEN || !env.CHAT_ID) {
        return json({ ok: false, error: "misconfigured" }, 500, corsHeaders);
      }

      const telegram = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.CHAT_ID,
            text: textMsg,
            disable_web_page_preview: true,
          }),
        }
      );

      if (!telegram.ok) {
        return json({ ok: false, error: "upstream error" }, 502, corsHeaders);
      }

      ctx.waitUntil(bumpRate(ip));
      return json({ ok: true }, 200, corsHeaders);
    } catch {
      return json({ ok: false, error: "bad request" }, 400, corsHeaders);
    }
  },
};

function sanitize(input, maxLen) {
  return String(input || "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    .trim()
    .slice(0, maxLen);
}

function sanitizePage(path) {
  const p = String(path || "/").slice(0, 200);
  return /^\/[\w\-./]*$/.test(p) ? p : "/";
}

async function isRateLimited(ip) {
  try {
    const key = new Request(`https://finpulse-rl.invalid/${encodeURIComponent(ip)}`);
    const hit = await caches.default.match(key);
    if (!hit) return false;
    const data = await hit.json();
    return (data.count || 0) >= RATE_MAX;
  } catch {
    return false;
  }
}

async function bumpRate(ip) {
  try {
    const key = new Request(`https://finpulse-rl.invalid/${encodeURIComponent(ip)}`);
    const hit = await caches.default.match(key);
    let count = 1;
    if (hit) {
      const data = await hit.json();
      count = (data.count || 0) + 1;
    }
    const res = new Response(JSON.stringify({ count, t: Date.now() }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${Math.ceil(RATE_WINDOW_MS / 1000)}`,
      },
    });
    await caches.default.put(key, res);
  } catch {
    /* ignore cache errors */
  }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(body, status, headers) {
  return new Response(body, {
    status,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}
