import { supabaseClient } from "@/lib/shared/supabase/client";

export async function verifyClockInPasskey() {
  const before = await supabaseClient.auth.getUser();
  if (before.error) throw before.error;

  const expectedUserId = before.data?.user?.id || null;
  if (!expectedUserId) {
    throw new Error("Sign in before verifying your identity");
  }

  const result = await supabaseClient.auth.signInWithPasskey();
  if (result.error) throw result.error;

  const verifiedUserId = result.data?.user?.id || null;
  if (!verifiedUserId || verifiedUserId !== expectedUserId) {
    await supabaseClient.auth.signOut();
    throw new Error(
      "That passkey belongs to a different account. Sign in again with your own staff account"
    );
  }

  return {
    userId: verifiedUserId,
    verified: true,
  };
}

export default verifyClockInPasskey;
