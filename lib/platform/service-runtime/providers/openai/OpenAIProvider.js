import OpenAI from "openai";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

async function getOpenAIClient(credentialId = null) {
  let apiKey = process.env.OPENAI_API_KEY;

  if (credentialId) {
    const credential = await CredentialRuntime.resolve(credentialId);

    if (credential?.secret