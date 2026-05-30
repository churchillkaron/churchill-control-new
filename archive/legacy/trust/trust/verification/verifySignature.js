import crypto from "crypto";

export default function verifySignature({
  actor,
  action_type,
  payload = {},
  timestamp,
  signature,
}) {

  const raw =
    JSON.stringify({

      actor,

      action_type,

      payload,

      timestamp,
    });

  const expected =
    crypto
      .createHash("sha256")
      .update(raw)
      .digest("hex");

  return {

    success: true,

    verified:
      expected === signature,
  };
}
