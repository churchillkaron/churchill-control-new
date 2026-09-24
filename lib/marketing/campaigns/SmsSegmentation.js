const GSM_BASIC = new Set([
  ..."@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ",
  ..." !\"#¤%&'()*+,-./0123456789:;<=>?",
  ..."¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
]);
const GSM_EXTENDED = new Set([..."^{}\\[~]|€\f"]);

export function analyzeSmsSegments(value) {
  const message = String(value ?? "");
  let septets = 0;
  let gsm7 = true;
  for (const char of message) {
    if (GSM_BASIC.has(char)) septets += 1;
    else if (GSM_EXTENDED.has(char)) septets += 2;
    else { gsm7 = false; break; }
  }

  const characters = Array.from(message).length;
  if (gsm7) {
    const segments = septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153);
    const capacity = segments <= 1 ? 160 : segments * 153;
    return { encoding: "GSM-7", characters, units: septets, segments, remaining_units: Math.max(0, capacity - septets), single_segment_limit: 160, multipart_segment_limit: 153 };
  }

  const units = message.length;
  const segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
  const capacity = segments <= 1 ? 70 : segments * 67;
  return { encoding: "UCS-2", characters, units, segments, remaining_units: Math.max(0, capacity - units), single_segment_limit: 70, multipart_segment_limit: 67 };
}

export default analyzeSmsSegments;
