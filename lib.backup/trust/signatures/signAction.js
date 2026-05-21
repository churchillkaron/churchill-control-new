import crypto from "crypto";

export default function signAction({
  actor = "SYSTEM",
  action_type,
  payload = {},
}) {

  const timestamp =
    new Date().toISOString();

  const raw =
    JSON.stringify({

      actor,

      action_type,

      payload,

      timestamp,
    });

  const signature =
    crypto
      .createHash("sha256")
      .update(raw)
      .digest("hex");

  return {

    actor,

    action_type,

    payload,

    timestamp,

    signature,
  };
}
