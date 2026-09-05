const TRANSPORTS = Object.freeze({
  booking_com: Object.freeze({ provider: 'booking_com', implemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  agoda: Object.freeze({ provider: 'agoda', implemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  expedia_group: Object.freeze({ provider: 'expedia_group', implemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  trip_com: Object.freeze({ provider: 'trip_com', implemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  traveloka: Object.freeze({ provider: 'traveloka', implemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  airbnb: Object.freeze({ provider: 'airbnb', implemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'SOFTWARE_PARTNER' }),
});

export const HOTEL_CHANNEL_TRANSPORTS = TRANSPORTS;

export function getHotelChannelTransport(provider) {
  const id = String(provider || '').trim().toLowerCase();
  return TRANSPORTS[id] || null;
}

export function isHotelChannelTransportImplemented(provider) {
  return Boolean(getHotelChannelTransport(provider)?.implemented);
}

export function requireHotelChannelTransport(provider) {
  const transport = getHotelChannelTransport(provider);
  if (!transport) throw new Error('Unsupported Hotel channel provider transport');
  if (!transport.implemented || !transport.adapter) {
    throw new Error(`Hotel channel transport is not implemented for ${transport.provider}`);
  }
  return transport;
}

export default HOTEL_CHANNEL_TRANSPORTS;
