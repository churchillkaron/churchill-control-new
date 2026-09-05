import { BookingComTransport } from '@/lib/hotel/channels/providers/BookingComTransport';

const TRANSPORTS = Object.freeze({
  booking_com: Object.freeze({
    provider: 'booking_com',
    implemented: true,
    outboundImplemented: true,
    reservationIngestImplemented: false,
    adapter: BookingComTransport,
    inboundAuth: 'TOKEN_BASED_PULL_ACK_PENDING',
    outboundMode: 'BOOKING_BXML_AVAILABILITY_V1_1',
  }),
  agoda: Object.freeze({ provider: 'agoda', implemented: false, outboundImplemented: false, reservationIngestImplemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  expedia_group: Object.freeze({ provider: 'expedia_group', implemented: false, outboundImplemented: false, reservationIngestImplemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  trip_com: Object.freeze({ provider: 'trip_com', implemented: false, outboundImplemented: false, reservationIngestImplemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  traveloka: Object.freeze({ provider: 'traveloka', implemented: false, outboundImplemented: false, reservationIngestImplemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'CERTIFIED_CONNECTIVITY' }),
  airbnb: Object.freeze({ provider: 'airbnb', implemented: false, outboundImplemented: false, reservationIngestImplemented: false, adapter: null, inboundAuth: 'PROVIDER_SPECIFIC', outboundMode: 'SOFTWARE_PARTNER' }),
});

export const HOTEL_CHANNEL_TRANSPORTS = TRANSPORTS;

export function getHotelChannelTransport(provider) {
  const id = String(provider || '').trim().toLowerCase();
  return TRANSPORTS[id] || null;
}

export function isHotelChannelTransportImplemented(provider) {
  const transport = getHotelChannelTransport(provider);
  return Boolean(transport?.implemented && transport?.outboundImplemented && transport?.adapter?.sendAvailability);
}

export function isHotelChannelLiveTransportImplemented(provider) {
  const transport = getHotelChannelTransport(provider);
  return Boolean(
    transport?.implemented
      && transport?.outboundImplemented
      && transport?.reservationIngestImplemented
      && transport?.adapter?.sendAvailability,
  );
}

export function requireHotelChannelTransport(provider) {
  const transport = getHotelChannelTransport(provider);
  if (!transport) throw new Error('Unsupported Hotel channel provider transport');
  if (!isHotelChannelTransportImplemented(provider)) {
    throw new Error(`Hotel channel transport is not implemented for ${transport.provider}`);
  }
  return transport;
}

export default HOTEL_CHANNEL_TRANSPORTS;
