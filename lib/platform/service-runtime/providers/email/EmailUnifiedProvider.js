import {
  GoogleEmailProvider,
  MicrosoftEmailProvider,
  ImapEmailProvider,
} from "./EmailProvider.js";
import {
  syncGoogleInbox,
  syncMicrosoftInbox,
  syncImapInbox,
} from "./EmailInboundRuntime.js";
import {
  ensureGoogleEmailSubscription,
  ensureMicrosoftEmailSubscription,
} from "./EmailSubscriptionRuntime.js";

function provider(id, outbound, inbound, subscribe = null) {
  return {
    id,
    async execute(input = {}) {
      if (input.capability === "communication.email.send") {
        return outbound.execute(input);
      }
      if (input.capability === "communication.email.sync") {
        const output = await inbound(input);
        return {
          success: true,
          provider: id,
          output,
        };
      }
      if (input.capability === "communication.email.subscribe" && subscribe) {
        const output = await subscribe(input);
        return {
          success: true,
          provider: id,
          output,
        };
      }
      throw new Error(`${id} capability not supported: ${input.capability}`);
    },
  };
}

export const GoogleEmailUnifiedProvider = provider(
  "email_google",
  GoogleEmailProvider,
  syncGoogleInbox,
  ensureGoogleEmailSubscription,
);

export const MicrosoftEmailUnifiedProvider = provider(
  "email_microsoft",
  MicrosoftEmailProvider,
  syncMicrosoftInbox,
  ensureMicrosoftEmailSubscription,
);

export const ImapEmailUnifiedProvider = provider(
  "email_imap",
  ImapEmailProvider,
  syncImapInbox,
  null,
);
