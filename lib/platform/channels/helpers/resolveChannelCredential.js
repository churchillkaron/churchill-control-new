import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";


export async function resolveChannelCredential(
  connection
) {

  if (!connection?.credentials_reference) {

    return null;

  }


  const credential =
    await CredentialRuntime.resolve(
      connection.credentials_reference,
      { organization_id: connection.organization_id || null },
    );


  return credential?.secret_reference || null;

}
