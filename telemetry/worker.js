/**
 * Cloudflare Worker — Telemetry relay for WordAPA7
 *
 * Receives anonymous error reports from the desktop app and creates
 * GitHub Issues in the repo. Rate-limited and validated.
 *
 * Deployment:
 *   1. npx wrangler deploy
 *   2. Set secret: npx wrangler secret put GITHUB_TOKEN
 *      (fine-grained token with Issues:write on this repo only)
 *
 * Expected payload (POST JSON):
 *   {
 *     "pipeline_version": "2025.08.06",
 *     "error_type": "parse_failure",
 *     "error_message": "XML parsing error at line 42",
 *     "stack_trace": "...",
 *     "doc_metadata": {
 *       "element_count": 150,
 *       "has_tables": true,
 *       "has_images": true,
 *       "file_size_kb": 240.5,
 *       "page_count": 12
 *     },
 *     "install_id": "a1b2c3d4-...",
 *     "app_version": "1.2.0",
 *     "os": "win32"
 *   }
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes per install_id
const ALLOWED_ERROR_TYPES = new Set([
  "parse_failure",
  "classification_timeout",
  "classification_error",
  "generation_error",
  "portada_boundary_excessive",
  "pipeline_crash",
  "unknown",
]);

const ALLOWED_METADATA_KEYS = new Set([
  "element_count", "has_tables", "has_images",
  "file_size_kb", "page_count",
]);

function validatePayload(data) {
  if (!data || typeof data !== "object") return "Payload must be a JSON object";
  if (!data.pipeline_version || typeof data.pipeline_version !== "string") return "Missing pipeline_version";
  if (!data.error_type || !ALLOWED_ERROR_TYPES.has(data.error_type)) return `Invalid error_type: ${data.error_type}`;
  if (!data.error_message || typeof data.error_message !== "string") return "Missing error_message";
  if (data.error_message.length > 2000) return "error_message too long";
  if (!data.install_id || typeof data.install_id !== "string") return "Missing install_id";
  if (data.install_id.length > 100) return "install_id too long";

  if (data.doc_metadata && typeof data.doc_metadata === "object") {
    for (const key of Object.keys(data.doc_metadata)) {
      if (!ALLOWED_METADATA_KEYS.has(key)) return `Invalid metadata key: ${key}`;
      const val = data.doc_metadata[key];
      if (typeof val === "string" && val.length > 100) return `Metadata value too long: ${key}`;
    }
  }

  if (data.stack_trace && data.stack_trace.length > 5000) return "stack_trace too long";
  if (data.app_version && data.app_version.length > 50) return "app_version too long";
  if (data.os && data.os.length > 50) return "os too long";

  return null; // valid
}

async function findExistingIssue(errorType, pipelineVersion, headers) {
  const query = `is:issue is:open label:telemetry label:${encodeURIComponent(errorType)} in:title "v${pipelineVersion}"`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=3`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.items && data.items.length > 0) return data.items[0];
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/report") {
      return new Response("Not found", { status: 404 });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const validationError = validatePayload(data);
    if (validationError) {
      return new Response(validationError, { status: 400 });
    }

    // Rate limiting by install_id (in-memory, resets on worker cold start)
    const rateLimitKey = `rate:${data.install_id}`;
    const lastReport = await env.TELEMETRY_KV.get(rateLimitKey);
    if (lastReport) {
      const elapsed = Date.now() - parseInt(lastReport);
      if (elapsed < RATE_LIMIT_WINDOW_MS) {
        return new Response("Rate limited", { status: 429 });
      }
    }
    await env.TELEMETRY_KV.put(rateLimitKey, String(Date.now()));

    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) {
      return new Response("Server configuration error", { status: 500 });
    }

    const [owner, repo] = (env.GITHUB_REPO || "user/wordapa7").split("/");
    const headers = {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "wordapa7-telemetry/1.0",
    };

    // Build issue body
    const meta = data.doc_metadata || {};
    const bodyLines = [
      `### Error Report`,
      ``,
      `| Field | Value |`,
      `|---|---|`,
      `| Pipeline version | \`${data.pipeline_version}\` |`,
      `| Error type | \`${data.error_type}\` |`,
      `| App version | \`${data.app_version || "unknown"}\` |`,
      `| OS | \`${data.os || "unknown"}\` |`,
    ];
    if (Object.keys(meta).length > 0) {
      bodyLines.push(`| Element count | ${meta.element_count || "?"} |`);
      if (meta.file_size_kb) bodyLines.push(`| File size | ${meta.file_size_kb} KB |`);
      if (meta.has_tables) bodyLines.push(`| Has tables | yes |`);
      if (meta.has_images) bodyLines.push(`| Has images | yes |`);
    }
    bodyLines.push(``);
    bodyLines.push(`\`\`\``);
    bodyLines.push(`Error: ${data.error_message}`);
    if (data.stack_trace) {
      bodyLines.push(``);
      bodyLines.push(data.stack_trace);
    }
    bodyLines.push(`\`\`\``);
    bodyLines.push(``);
    bodyLines.push(`Install ID: \`${data.install_id.slice(0, 8)}...\``);

    const issueBody = bodyLines.join("\n");
    const issueTitle = `[auto] ${data.error_type} — v${data.pipeline_version}`;

    // Check for existing issue
    const existing = await findExistingIssue(data.error_type, data.pipeline_version, headers);
    if (existing) {
      // Add comment instead of creating new issue
      const commentUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}/comments`;
      await fetch(commentUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ body: `+1 occurrence\n\nInstall: \`${data.install_id.slice(0, 8)}...\` | OS: \`${data.os || "?"}\` | Elements: ${meta.element_count || "?"}` }),
      });
      return new Response(JSON.stringify({ status: "ok", action: "commented", issue: existing.number }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create new issue
    const createUrl = `https://api.github.com/repos/${owner}/${repo}/issues`;
    const resp = await fetch(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["telemetry", data.error_type],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(`GitHub API error: ${errText}`, { status: 502 });
    }

    const issue = await resp.json();
    return new Response(JSON.stringify({ status: "ok", action: "created", issue: issue.number }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  },
};
