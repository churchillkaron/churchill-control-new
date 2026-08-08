export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

const APPROVAL_ENDPOINT = "/api/creative/tests/gemini-omni-5s/research-approval";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function html(body, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const approvalPhrase = text(url.searchParams.get("approval_phrase"));

  if (!approvalPhrase) {
    return html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Research approval required</title></head>
<body><pre>${TEST_CONTRACT}\nCREATIVE_RESEARCH_APPROVAL_PHRASE_REQUIRED</pre></body>
</html>`, 400);
  }

  const phraseJson = JSON.stringify(approvalPhrase).replace(/</g, "\\u003c");
  const endpointJson = JSON.stringify(APPROVAL_ENDPOINT);

  return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Avantiqo research approval</title>
</head>
<body>
  <pre id="result">Submitting governed research approval...</pre>
  <script>
    (async () => {
      const result = document.getElementById("result");
      try {
        const response = await fetch(${endpointJson}, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approval_phrase: ${phraseJson} })
        });
        const raw = await response.text();
        let payload;
        try { payload = JSON.parse(raw); } catch { payload = { raw }; }
        result.textContent = JSON.stringify(payload, null, 2);
        document.title = payload?.success ? "Research approved" : "Research approval failed";
      } catch (error) {
        result.textContent = JSON.stringify({
          success: false,
          contract: ${JSON.stringify(TEST_CONTRACT)},
          error: String(error?.message || error)
        }, null, 2);
        document.title = "Research approval failed";
      }
    })();
  </script>
</body>
</html>`);
}
