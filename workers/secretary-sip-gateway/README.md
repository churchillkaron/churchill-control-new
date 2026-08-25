# Avantiqo Secretary SIP Gateway

This service is the Avantiqo-owned telephone transport boundary for Secretary calls.

It does not own contacts, calendar, policy, memory, commitments, follow-ups, conversation intelligence, STT or TTS. Those remain inside Avantiqo. Asterisk and the SIP carrier only provide telephone/media transport.

## Local certification

From the repository root:

```bash
npm run smoke:operator-secretary-sip-gateway
npm run audit:operator-secretary-end-to-end
```

The gateway smoke uses a fake Asterisk AMI server and fake Avantiqo call APIs while running the real gateway process and real AudioSocket framing. It performs no carrier/PSTN call and no provider spend.

## Container build

```bash
cd workers/secretary-sip-gateway
docker build -t avantiqo-secretary-sip-gateway:local .
```

The image performs Node syntax checks during build and exposes:

- `8787/tcp` - Avantiqo gateway control/health HTTP
- `9019/tcp` - Asterisk AudioSocket media

## Local gateway runtime

Copy `.env.example` to a local untracked environment file and provide real local values. Never commit those values.

```bash
cd workers/secretary-sip-gateway
docker compose --env-file .env.local -f docker-compose.gateway.yml up --build
```

The HTTP port binds to localhost by default. AudioSocket also binds to localhost by default; set `SECRETARY_GATEWAY_AUDIO_BIND` only when Asterisk is on another trusted host/network.

## Asterisk

Use the source templates in `asterisk/`:

- `extensions.conf.example` - inbound/outbound Secretary dialplan
- `manager.conf.example` - least-authority AMI account template
- `inbound-agi.mjs` - inbound registration bridge

The Asterisk host must provide the AudioSocket application/module and PJSIP transport required by the selected SIP trunk.

For inbound DIDs, route the carrier/PJSIP endpoint into the `avantiqo-secretary-inbound` context and set `AVANTIQO_PHONE_LINE_ID` for the corresponding native `secretary_phone_lines.id`.

For outbound calls, the gateway uses AMI Originate and sends the answered channel into `avantiqo-secretary-outbound`, where AudioSocket connects back to the gateway.

## Required gateway secrets/configuration

The gateway requires these values at runtime:

- `AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN`
- `AVANTIQO_SECRETARY_PUBLIC_BASE_URL`
- `AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN`
- `ASTERISK_AMI_HOST`
- `ASTERISK_AMI_PORT`
- `ASTERISK_AMI_USERNAME`
- `ASTERISK_AMI_SECRET`

Carrier/SIP credentials belong in Asterisk/PJSIP configuration, not in Avantiqo application source and not in this gateway repository directory.

## Release gate

Do not call the phone stack production-certified until all of these have passed on the intended release revision:

1. `npm run audit:operator-secretary-end-to-end`
2. full repository `npm run build`
3. gateway container health is green
4. Asterisk loads the AudioSocket and PJSIP modules required by the configuration
5. inbound test DID reaches Avantiqo and completes at least one real voice turn
6. controlled outbound test call reaches the intended test number and completes at least one real voice turn
7. call state ends terminally in Avantiqo with no stuck `CLAIMED`, `DIALING`, or `CONNECTED` request
8. no production business data or real customer contact is used for the certification call

Production deployment remains the final release step. Source existence or a healthy container alone is not production certification.
