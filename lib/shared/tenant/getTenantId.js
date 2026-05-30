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

    if (!tenantId) {

      return null;

    }

    return tenantId;

  } catch (error) {

    console.error(error);

    return null;

  }

}
