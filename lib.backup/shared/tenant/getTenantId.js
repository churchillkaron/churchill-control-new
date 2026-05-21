import {
  cookies,
} from "next/headers";

export async function getTenantId() {

  try {

    const cookieStore =
      cookies();

    const tenantId =

      cookieStore
        .get("tenant_id")
        ?.value;

    if (tenantId) {

      return tenantId;

    }

    // TEMP FALLBACK

    return "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  } catch (error) {

    console.error(error);

    return null;

  }

}
