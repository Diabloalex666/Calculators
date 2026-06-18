export default {
  async fetch(request, env) {
    const allowedOrigins = ["https://finraz.ru", "https://www.finraz.ru"];
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const body = await request.json();
      const message = String(body.message || "").trim().slice(0, 2000);
      const contact = String(body.contact || "").trim().slice(0, 120);
      const page = String(body.page || "/").slice(0, 200);

      if (message.length < 5) {
        return json({ ok: false, error: "message too short" }, 400, corsHeaders);
      }

      const text = [
        "📩 FinPulse — обратная связь",
        "",
        `📄 Страница: ${page}`,
        `💬 Сообщение: ${message}`,
        `📧 Контакт: ${contact || "не указан"}`,
      ].join("\n");

      const telegram = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.CHAT_ID,
          text,
        }),
      });

      if (!telegram.ok) {
        return json({ ok: false, error: "telegram error" }, 502, corsHeaders);
      }

      return json({ ok: true }, 200, corsHeaders);
    } catch {
      return json({ ok: false, error: "server error" }, 500, corsHeaders);
    }
  },
};

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
