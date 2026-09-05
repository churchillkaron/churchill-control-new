import { hotelChannelEvidenceFingerprint } from '@/lib/hotel/channels/HotelChannelEvidenceRuntime';

const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_XML_NODES = 50000;
const MAX_XML_DEPTH = 80;

function clean(value) {
  return String(value ?? '').trim();
}

function localName(value) {
  return clean(value).split(':').pop();
}

function decodeXml(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return match;
  });
}

function parseAttributes(raw) {
  const attributes = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(raw))) attributes[localName(match[1])] = decodeXml(match[2] ?? match[3] ?? '');
  return attributes;
}

function readTag(source, start) {
  let quote = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '>') return { token: source.slice(start, index + 1), end: index + 1 };
  }
  throw new Error('BOOKING_COM_OTA_XML_UNTERMINATED_TAG');
}

export function parseBookingComOtaXml(source) {
  const xml = String(source ?? '');
  if (!xml.trim()) return { name: '#document', attributes: {}, children: [], text: '' };
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) throw new Error('BOOKING_COM_OTA_XML_TOO_LARGE');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('BOOKING_COM_OTA_XML_DTD_FORBIDDEN');

  const document = { name: '#document', attributes: {}, children: [], text: '' };
  const stack = [document];
  let cursor = 0;
  let nodeCount = 0;

  const appendText = (value) => {
    if (!value) return;
    stack[stack.length - 1].text += decodeXml(value);
  };

  while (cursor < xml.length) {
    const open = xml.indexOf('<', cursor);
    if (open < 0) {
      appendText(xml.slice(cursor));
      break;
    }
    appendText(xml.slice(cursor, open));

    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open + 4);
      if (end < 0) throw new Error('BOOKING_COM_OTA_XML_UNTERMINATED_COMMENT');
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', open)) {
      const end = xml.indexOf('?>', open + 2);
      if (end < 0) throw new Error('BOOKING_COM_OTA_XML_UNTERMINATED_DECLARATION');
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const end = xml.indexOf(']]>', open + 9);
      if (end < 0) throw new Error('BOOKING_COM_OTA_XML_UNTERMINATED_CDATA');
      appendText(xml.slice(open + 9, end));
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<!', open)) throw new Error('BOOKING_COM_OTA_XML_DECLARATION_FORBIDDEN');

    const { token, end } = readTag(xml, open);
    const body = token.slice(1, -1).trim();
    if (!body) throw new Error('BOOKING_COM_OTA_XML_EMPTY_TAG');

    if (body.startsWith('/')) {
      const closing = localName(body.slice(1).trim().split(/\s+/)[0]);
      if (stack.length === 1 || stack[stack.length - 1].name !== closing) throw new Error('BOOKING_COM_OTA_XML_TAG_MISMATCH');
      stack.pop();
      cursor = end;
      continue;
    }

    const selfClosing = /\/\s*$/.test(body);
    const startBody = selfClosing ? body.replace(/\/\s*$/, '').trim() : body;
    const nameMatch = startBody.match(/^([^\s/>]+)/);
    if (!nameMatch) throw new Error('BOOKING_COM_OTA_XML_TAG_INVALID');
    const rawName = nameMatch[1];
    const node = {
      name: localName(rawName),
      attributes: parseAttributes(startBody.slice(rawName.length)),
      children: [],
      text: '',
    };
    nodeCount += 1;
    if (nodeCount > MAX_XML_NODES) throw new Error('BOOKING_COM_OTA_XML_NODE_LIMIT');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
      if (stack.length > MAX_XML_DEPTH) throw new Error('BOOKING_COM_OTA_XML_DEPTH_LIMIT');
    }
    cursor = end;
  }

  if (stack.length !== 1) throw new Error('BOOKING_COM_OTA_XML_UNCLOSED_TAG');
  return document;
}

function direct(node, name) {
  return (node?.children || []).filter((child) => child.name === name);
}

function firstDirect(node, name) {
  return direct(node, name)[0] || null;
}

function descendants(node, name, results = []) {
  for (const child of node?.children || []) {
    if (child.name === name) results.push(child);
    descendants(child, name, results);
  }
  return results;
}

function firstDescendant(node, name) {
  return descendants(node, name, [])[0] || null;
}

function nodeText(node) {
  if (!node) return '';
  return clean(`${node.text || ''} ${(node.children || []).map(nodeText).join(' ')}`.replace(/\s+/g, ' '));
}

function attr(node, name) {
  return clean(node?.attributes?.[name]);
}

function bookingAmount(node) {
  if (!node) return null;
  const raw = clean(attr(node, 'AmountAfterTax') || attr(node, 'AmountBeforeTax'));
  if (!raw) return null;
  const minorUnits = Number(raw);
  const decimalsRaw = clean(attr(node, 'DecimalPlaces'));
  const decimalPlaces = decimalsRaw === '' ? 0 : Number(decimalsRaw);
  if (!Number.isFinite(minorUnits) || !Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new Error('BOOKING_COM_OTA_AMOUNT_INVALID');
  }
  return minorUnits / (10 ** decimalPlaces);
}

function safeDate(value) {
  const date = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function identityFromProfile(profile) {
  if (!profile) return null;
  const customer = firstDescendant(profile, 'Customer') || profile;
  const givenName = nodeText(firstDescendant(customer, 'GivenName'));
  const surname = nodeText(firstDescendant(customer, 'Surname'));
  const email = nodeText(firstDescendant(customer, 'Email')) || null;
  const telephone = firstDescendant(customer, 'Telephone');
  const country = firstDescendant(customer, 'CountryName');
  const fullName = clean(`${givenName} ${surname}`) || nodeText(firstDescendant(customer, 'PersonName')) || null;
  if (!fullName && !email && !attr(telephone, 'PhoneNumber')) return null;
  return {
    full_name: fullName,
    email,
    phone: attr(telephone, 'PhoneNumber') || null,
    nationality: attr(country, 'Code') || null,
  };
}

function guestIdentity(reservation) {
  for (const resGuest of descendants(reservation, 'ResGuest', [])) {
    const profile = firstDescendant(resGuest, 'Profile');
    const identity = identityFromProfile(profile);
    if (identity) return identity;
  }
  return null;
}

function bookerIdentity(resGlobalInfo) {
  const profiles = firstDirect(resGlobalInfo, 'Profiles') || firstDescendant(resGlobalInfo, 'Profiles');
  return identityFromProfile(firstDescendant(profiles, 'Profile'));
}

function reservationIds(resGlobalInfo) {
  const container = firstDirect(resGlobalInfo, 'HotelReservationIDs') || firstDescendant(resGlobalInfo, 'HotelReservationIDs');
  return direct(container, 'HotelReservationID').map((node) => ({
    value: attr(node, 'ResID_Value'),
    date: attr(node, 'ResID_Date') || null,
    type: attr(node, 'ResID_Type') || null,
    source: attr(node, 'ResID_Source') || null,
  })).filter((entry) => entry.value);
}

function primaryReservationId(ids) {
  return ids.find((entry) => /^\d+$/.test(entry.value))?.value || ids[0]?.value || null;
}

function guestCounts(roomStay) {
  let adults = 0;
  let children = 0;
  for (const guestCount of descendants(roomStay, 'GuestCount', [])) {
    const count = Math.max(0, Number(attr(guestCount, 'Count') || 0) || 0);
    const code = attr(guestCount, 'AgeQualifyingCode');
    if (code === '8') children += count;
    else adults += count;
  }
  return { adults: Math.max(1, adults), children };
}

function roomPayload(roomStay, fallbackCurrency) {
  const roomType = firstDescendant(roomStay, 'RoomType');
  const roomRate = firstDescendant(roomStay, 'RoomRate');
  const timeSpan = firstDescendant(roomStay, 'TimeSpan');
  const total = firstDirect(roomStay, 'Total') || firstDescendant(roomStay, 'Total');
  const counts = guestCounts(roomStay);
  return {
    index: attr(roomStay, 'IndexNumber') || null,
    external_room_type_id: attr(roomType, 'RoomTypeCode') || null,
    external_rate_plan_id: attr(roomRate, 'RatePlanCode') || null,
    check_in_date: safeDate(attr(timeSpan, 'Start')),
    check_out_date: safeDate(attr(timeSpan, 'End')),
    adults: counts.adults,
    children: counts.children,
    amount: bookingAmount(total),
    currency_code: (attr(total, 'CurrencyCode') || fallbackCurrency || '').toUpperCase() || null,
  };
}

function explicitCancellation(reservation) {
  const status = clean(attr(reservation, 'ResStatus') || attr(reservation, 'Status')).toUpperCase();
  if (['CANCELLED', 'CANCELED', 'CANCEL'].includes(status)) return true;
  return descendants(reservation, 'CancelInfo', []).length > 0;
}

function normalizedReservation(reservation, endpointKind) {
  const resGlobalInfo = firstDirect(reservation, 'ResGlobalInfo') || firstDescendant(reservation, 'ResGlobalInfo');
  if (!resGlobalInfo) throw new Error('BOOKING_COM_OTA_RES_GLOBAL_INFO_REQUIRED');
  const ids = reservationIds(resGlobalInfo);
  const externalReservationId = primaryReservationId(ids);
  if (!externalReservationId) throw new Error('BOOKING_COM_OTA_RESERVATION_ID_REQUIRED');

  const globalTotal = firstDirect(resGlobalInfo, 'Total') || firstDescendant(resGlobalInfo, 'Total');
  const currencyCode = attr(globalTotal, 'CurrencyCode').toUpperCase() || null;
  const rooms = descendants(firstDirect(reservation, 'RoomStays') || firstDescendant(reservation, 'RoomStays'), 'RoomStay', [])
    .map((room) => roomPayload(room, currencyCode));
  const property = firstDescendant(reservation, 'BasicPropertyInfo');
  const lastModify = nodeText(firstDirect(reservation, 'LastModifyDateTime') || firstDescendant(reservation, 'LastModifyDateTime')) || null;
  const eventType = endpointKind === 'NEW' ? 'NEW' : (explicitCancellation(reservation) ? 'CANCEL' : 'MODIFY');
  const payload = {
    contract: 'BOOKING_COM_OTA_RESERVATIONS_V1',
    provider: 'booking_com',
    endpoint_kind: endpointKind,
    event_type: eventType,
    external_property_id: attr(property, 'HotelCode') || null,
    external_reservation_id: externalReservationId,
    reservation_ids: ids,
    last_modify_at: lastModify,
    total_amount: bookingAmount(globalTotal),
    currency_code: currencyCode,
    guest: guestIdentity(reservation),
    booker: bookerIdentity(resGlobalInfo),
    rooms,
    payment_details_redacted: true,
    sensitive_payment_data_persisted: false,
  };
  const eventVersion = lastModify || ids.find((entry) => entry.type === '18')?.value || ids.find((entry) => entry.type === '14')?.value || ids[0]?.date || hotelChannelEvidenceFingerprint(payload).slice(0, 24);
  return { ...payload, event_version: eventVersion };
}

export function parseBookingComOtaReservations(body, endpointKind = 'NEW') {
  const kind = clean(endpointKind).toUpperCase();
  if (!['NEW', 'MODIFY'].includes(kind)) throw new Error('BOOKING_COM_OTA_ENDPOINT_KIND_INVALID');
  const document = parseBookingComOtaXml(body);
  const reservationName = kind === 'NEW' ? 'HotelReservation' : 'HotelResModify';
  return descendants(document, reservationName, []).map((reservation) => normalizedReservation(reservation, kind));
}

function escapeXml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function idXml(ids = []) {
  return ids.map((id) => {
    const attrs = [
      ['ResID_Value', id.value],
      ['ResID_Date', id.date],
      ['ResID_Type', id.type],
      ['ResID_Source', id.source],
    ].filter(([, value]) => clean(value)).map(([name, value]) => `${name}="${escapeXml(value)}"`).join(' ');
    return `<HotelReservationID ${attrs}/>`;
  }).join('');
}

export function buildBookingComOtaAcknowledgement({ endpointKind = 'NEW', reservationIds = [], success = true, errorText = null } = {}) {
  const kind = clean(endpointKind).toUpperCase();
  if (!['NEW', 'MODIFY'].includes(kind)) throw new Error('BOOKING_COM_OTA_ACK_KIND_INVALID');
  if (!reservationIds.length) throw new Error('BOOKING_COM_OTA_ACK_IDS_REQUIRED');
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  const root = kind === 'NEW' ? 'OTA_HotelResNotifRS' : 'OTA_HotelResModifyNotifRS';
  if (!success) {
    const recordId = primaryReservationId(reservationIds) || reservationIds[0]?.value;
    const shortText = clean(errorText || 'Reservation processing failed').slice(0, 200);
    return `<?xml version="1.0" encoding="UTF-8"?><${root} TimeStamp="${timestamp}" Target="Production"><Errors><Error Code="193" RecordID="${escapeXml(recordId)}" ShortText="${escapeXml(shortText)}"/></Errors></${root}>`;
  }
  const ids = idXml(reservationIds);
  if (kind === 'NEW') return `<?xml version="1.0" encoding="UTF-8"?><${root} TimeStamp="${timestamp}" Target="Production"><Success/><HotelReservations><HotelReservation><ResGlobalInfo><HotelReservationIDs>${ids}</HotelReservationIDs></ResGlobalInfo></HotelReservation></HotelReservations></${root}>`;
  return `<?xml version="1.0" encoding="UTF-8"?><${root} TimeStamp="${timestamp}" Target="Production"><Success/><HotelResModifies><HotelResModify><ResGlobalInfo><HotelReservationIDs>${ids}</HotelReservationIDs></ResGlobalInfo></HotelResModify></HotelResModifies></${root}>`;
}

export function bookingComOtaExternalEventId(reservation) {
  const stable = {
    external_reservation_id: reservation?.external_reservation_id,
    endpoint_kind: reservation?.endpoint_kind,
    event_type: reservation?.event_type,
    event_version: reservation?.event_version,
    reservation_ids: reservation?.reservation_ids,
  };
  return `${reservation?.external_reservation_id}:${reservation?.endpoint_kind}:${hotelChannelEvidenceFingerprint(stable).slice(0, 32)}`;
}
