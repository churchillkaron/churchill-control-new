FROM node:24-bookworm-slim

WORKDIR /opt/avantiqo/secretary-sip-gateway

COPY package.json ./package.json
COPY server.mjs ./server.mjs
COPY smoke.mjs ./smoke.mjs
COPY asterisk ./asterisk

RUN chmod +x ./asterisk/inbound-agi.mjs \
  && node --check ./server.mjs \
  && node --check ./asterisk/inbound-agi.mjs \
  && node --check ./smoke.mjs

ENV NODE_ENV=production \
    SECRETARY_GATEWAY_HTTP_HOST=0.0.0.0 \
    SECRETARY_GATEWAY_HTTP_PORT=8787 \
    SECRETARY_GATEWAY_AUDIO_HOST=0.0.0.0 \
    SECRETARY_GATEWAY_AUDIO_PORT=9019

EXPOSE 8787/tcp 9019/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(async r=>{const b=await r.json();process.exit(r.ok&&b.ok?0:1)}).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.mjs"]
