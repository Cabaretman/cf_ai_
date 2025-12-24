export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      if (url.pathname === "/api/session" && request.method === "POST") {
        return await startSession(env);
      }

      if (url.pathname === "/api/chat" && request.method === "POST") {
        return await handleChat(request, env);
      }

      if (url.pathname === "/api/history" && request.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        return await fetchHistory(env, sessionId);
      }

      // Serve static assets when present, otherwise 404.
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }

      return withCors(new Response("Not found", { status: 404 }));
    } catch (error) {
      console.error("Unhandled error", error);
      return withCors(new Response("Server error", { status: 500 }));
    }
  },
};

async function startSession(env) {
  const sessionId = crypto.randomUUID();
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  await stub.fetch("https://session/init", {
    method: "POST",
    body: JSON.stringify({ type: "init" }),
  });
  return jsonResponse({ sessionId });
}

async function handleChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return withCors(new Response("Invalid JSON", { status: 400 }));
  }

  const message = (payload?.message || "").trim();
  if (!message) {
    return withCors(new Response("Message is required", { status: 400 }));
  }

  const sessionId = payload.sessionId || crypto.randomUUID();
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));

  const history = await getHistory(stub);
  const messages = buildMessages(env, history, message);

  let aiResult;
  try {
    aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages });
  } catch (error) {
    console.error("AI.run failed", error);
    return jsonResponse({ sessionId, error: "AI upstream error. Please retry." }, 502);
  }

  const reply = extractReply(aiResult);

  await appendMessage(stub, { role: "user", content: message });
  await appendMessage(stub, { role: "assistant", content: reply });

  const updatedHistory = [...history, { role: "user", content: message }, { role: "assistant", content: reply }];

  return jsonResponse({ sessionId, reply, history: updatedHistory });
}

async function fetchHistory(env, sessionId) {
  if (!sessionId) {
    return withCors(new Response("sessionId is required", { status: 400 }));
  }
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  const history = await getHistory(stub);
  return jsonResponse({ sessionId, history });
}

async function getHistory(stub) {
  const res = await stub.fetch("https://session/history", {
    method: "POST",
    body: JSON.stringify({ type: "history" }),
  });
  if (!res.ok) {
    return [];
  }
  const { history = [] } = await res.json();
  return history;
}

async function appendMessage(stub, message) {
  await stub.fetch("https://session/append", {
    method: "POST",
    body: JSON.stringify({ type: "append", message }),
  });
}

function buildMessages(env, history, message) {
  const systemPrompt = env.SYSTEM_PROMPT || "You are a helpful AI.";
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];
}

function extractReply(aiResult) {
  if (typeof aiResult === "string") return aiResult;
  if (aiResult?.response) return aiResult.response;
  if (aiResult?.result) return aiResult.result;
  return "I could not find a response.";
}

function jsonResponse(data, status = 200) {
  return withCors(
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

export class SessionDO {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    let payload = {};
    try {
      payload = await request.json();
    } catch (error) {
      return new Response("Invalid DO payload", { status: 400 });
    }

    const type = payload.type;
    if (type === "init") {
      await this.state.storage.put("history", []);
      return new Response(null, { status: 204 });
    }

    if (type === "append") {
      const history = (await this.state.storage.get("history")) || [];
      history.push(payload.message);
      await this.state.storage.put("history", history);
      return new Response(null, { status: 204 });
    }

    if (type === "history") {
      const history = (await this.state.storage.get("history")) || [];
      return new Response(JSON.stringify({ history }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Unknown DO action", { status: 400 });
  }
}
