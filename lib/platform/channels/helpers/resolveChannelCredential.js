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
      connection.credentials_reference
    );


  return credential?.secret_reference || null;

}
