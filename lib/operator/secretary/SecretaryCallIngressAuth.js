import { timingSafeEqual } from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

export function authorizeSecretaryCallIngress(request) {
  const expected = text(process.env.AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN);
  if (!expected) return false;

  const authorization = text(request?.headers?.get?.("authorization"));
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  const supplied = authorization.slice(prefix.length).trim();
  if (!supplied) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  if (expectedBytes.length !== suppliedBytes.length) return false;
  return timingSafeEqual(expectedBytes, suppliedBytes);
}

export function secretaryCallIngressUnauthorized() {
  return Response.json(
    { success: false, error: "Unauthorized" },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export default authorizeSecretaryCallIngress;
