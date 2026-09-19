import "./WhatsAppCredentialRegistration.js";

export const WhatsAppProvider = {
  id: "whatsapp",

  async execute({
    capability,
    phone_number_id,
    access_token,
    recipient,
    message,
    template,
    attachments = [],
  } = {}) {
    if (!access_token) {
      throw new Error("WHATSAPP_ACCESS_TOKEN_REQUIRED");
    }
    if (!phone_number_id) {
      throw new Error("WHATSAPP_PHONE_NUMBER_ID_REQUIRED");
    }

    switch (capability) {
      case "communication.whatsapp.send":
        return sendMessage({ phone_number_id, access_token, recipient, message, attachments });

      case "communication.whatsapp.template":
        return sendTemplate({ phone_number_id, access_token, recipient, template });

      default:
        throw new Error(`WhatsApp capability not supported: ${capability}`);
    }
  },
};

function normalizedAttachments(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function validatePdfAttachment(attachment) {
  const mimeType = String(attachment?.mime_type || "").trim().toLowerCase();
  if (mimeType && mimeType !== "application/pdf") {
    throw new Error("WHATSAPP_DOCUMENT_PDF_REQUIRED");
  }
}

async function uploadDocument({ phone_number_id, access_token, attachment }) {
  validatePdfAttachment(attachment);
  const encoded = String(attachment?.data_base64 || "").trim();
  if (!encoded) return null;

  const filename = String(attachment?.name || "document.pdf").trim().slice(0, 240) || "document.pdf";
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) throw new Error("WHATSAPP_DOCUMENT_DATA_REQUIRED");

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
  const response = await fetch(`https://graph.facebook.com/v23.0/${phone_number_id}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}` },
    body: form,
  });
  const result = await response.json();
  if (!response.ok || !result?.id) {
    throw new Error(result?.error?.message || "WhatsApp document upload failed");
  }
  return result.id;
}

async function whatsappDocumentPayload({ phone_number_id, access_token, recipient, message, attachment }) {
  validatePdfAttachment(attachment);
  const uploadedId = await uploadDocument({ phone_number_id, access_token, attachment });
  const link = String(attachment?.url || "").trim();
  if (!uploadedId && !/^https?:\/\//i.test(link)) {
    throw new Error("WHATSAPP_DOCUMENT_REFERENCE_REQUIRED");
  }

  const document = uploadedId ? { id: uploadedId } : { link };
  const filename = String(attachment?.name || "").trim();
  const caption = String(message || "").trim();
  if (filename) document.filename = filename.slice(0, 240);
  if (caption) document.caption = caption.slice(0, 1024);

  return {
    messaging_product: "whatsapp",
    to: recipient,
    type: "document",
    document,
  };
}

async function sendMessage({ phone_number_id, access_token, recipient, message, attachments = [] }) {
  const files = normalizedAttachments(attachments);
  if (files.length > 1) {
    throw new Error("WHATSAPP_SINGLE_DOCUMENT_ATTACHMENT_REQUIRED");
  }

  const body = files.length === 1
    ? await whatsappDocumentPayload({ phone_number_id, access_token, recipient, message, attachment: files[0] })
    : {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body: message },
      };

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "WhatsApp send failed");
  }

  return { success: true, provider: "whatsapp", output: result };
}

async function sendTemplate({ phone_number_id, access_token, recipient, template }) {
  const response = await fetch(
    `https://graph.facebook.com/v23.0/${phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template,
      }),
    },
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "WhatsApp template send failed");
  }
  return result;
}
