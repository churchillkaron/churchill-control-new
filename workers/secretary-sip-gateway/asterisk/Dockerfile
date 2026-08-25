FROM debian:bookworm-slim AS builder

ARG ASTERISK_VERSION=22.10.1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    file \
    libcurl4-openssl-dev \
    libedit-dev \
    libjansson-dev \
    libncurses-dev \
    libspeexdsp-dev \
    libsqlite3-dev \
    libssl-dev \
    libxml2-dev \
    pkg-config \
    uuid-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src

RUN curl -fsSLO "https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz" \
    && curl -fsSLO "https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.sha256" \
    && sha256sum -c "asterisk-${ASTERISK_VERSION}.sha256" \
    && tar -xzf "asterisk-${ASTERISK_VERSION}.tar.gz" \
    && rm "asterisk-${ASTERISK_VERSION}.tar.gz" "asterisk-${ASTERISK_VERSION}.sha256"

WORKDIR /usr/src/asterisk-${ASTERISK_VERSION}

RUN ./configure --with-pjproject-bundled --with-jansson-bundled \
    && make menuselect.makeopts \
    && menuselect/menuselect --enable app_audiosocket --enable res_audiosocket --enable res_pjsip --enable chan_pjsip menuselect.makeopts \
    && make -j"$(nproc)" \
    && make install DESTDIR=/opt/asterisk-root \
    && test -x /opt/asterisk-root/usr/sbin/asterisk \
    && test -f /opt/asterisk-root/usr/lib/asterisk/modules/app_audiosocket.so \
    && test -f /opt/asterisk-root/usr/lib/asterisk/modules/res_audiosocket.so \
    && test -f /opt/asterisk-root/usr/lib/asterisk/modules/res_pjsip.so \
    && test -f /opt/asterisk-root/usr/lib/asterisk/modules/chan_pjsip.so \
    && test -f /opt/asterisk-root/var/lib/asterisk/documentation/core-en_US.xml

# Node is required only for the owned inbound AGI. Keep the Asterisk runtime on the
# previously certified Debian base and copy the Node 24 executable in as an isolated
# runtime dependency instead of changing Asterisk's operating-system image.
FROM node:24-bookworm-slim AS node-runtime

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libatomic1 \
    libcurl4 \
    libedit2 \
    libjansson4 \
    libncurses6 \
    libspeexdsp1 \
    libsqlite3-0 \
    libssl3 \
    libstdc++6 \
    libuuid1 \
    libxml2 \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system asterisk \
    && useradd --system --gid asterisk --home-dir /var/lib/asterisk --shell /usr/sbin/nologin asterisk \
    && mkdir -p \
      /etc/asterisk \
      /opt/avantiqo/secretary-sip-gateway \
      /var/cache/asterisk \
      /var/lib/asterisk \
      /var/log/asterisk \
      /var/run/asterisk \
      /var/spool/asterisk

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node

# Copy immutable Asterisk install artifacts and generated runtime data only. Never copy
# staged /var/run or other mutable runtime filesystem paths over Debian's final-stage layout.
COPY --from=builder /opt/asterisk-root/usr/ /usr/
COPY --from=builder /opt/asterisk-root/var/lib/asterisk/ /var/lib/asterisk/
COPY extensions.conf.example /etc/asterisk/extensions.conf
COPY inbound-agi.mjs /opt/avantiqo/secretary-sip-gateway/inbound-agi.mjs
COPY container-entrypoint.sh /usr/local/bin/avantiqo-asterisk-entrypoint

RUN test -x /usr/local/bin/node \
    && test "$(node --version | cut -d. -f1)" = "v24" \
    && node --check /opt/avantiqo/secretary-sip-gateway/inbound-agi.mjs \
    && test -x /usr/sbin/asterisk \
    && test -f /usr/lib/asterisk/modules/app_audiosocket.so \
    && test -f /usr/lib/asterisk/modules/res_audiosocket.so \
    && test -f /usr/lib/asterisk/modules/res_pjsip.so \
    && test -f /usr/lib/asterisk/modules/chan_pjsip.so \
    && test -f /var/lib/asterisk/documentation/core-en_US.xml \
    && /usr/sbin/asterisk -V \
    && printf '%s\n' \
      '[directories](!)' \
      'astcachedir => /var/cache/asterisk' \
      'astetcdir => /etc/asterisk' \
      'astmoddir => /usr/lib/asterisk/modules' \
      'astvarlibdir => /var/lib/asterisk' \
      'astdbdir => /var/lib/asterisk' \
      'astkeydir => /var/lib/asterisk' \
      'astdatadir => /var/lib/asterisk' \
      'astagidir => /var/lib/asterisk/agi-bin' \
      'astspooldir => /var/spool/asterisk' \
      'astrundir => /var/run/asterisk' \
      'astlogdir => /var/log/asterisk' \
      'astsbindir => /usr/sbin' \
      '' \
      '[options]' \
      'runuser = asterisk' \
      'rungroup = asterisk' \
      'defaultlanguage = en' \
      'documentation_language = en_US' \
      > /etc/asterisk/asterisk.conf \
    && printf '%s\n' \
      '[modules]' \
      'autoload=yes' \
      'load => res_audiosocket.so' \
      'load => app_audiosocket.so' \
      'load => res_pjsip.so' \
      'load => chan_pjsip.so' \
      > /etc/asterisk/modules.conf \
    && printf '%s\n' \
      '[global]' \
      'type=global' \
      'user_agent=Avantiqo Secretary' \
      > /etc/asterisk/pjsip.conf \
    && chmod 0755 \
      /usr/local/bin/avantiqo-asterisk-entrypoint \
      /opt/avantiqo/secretary-sip-gateway/inbound-agi.mjs \
    && chown -R asterisk:asterisk \
      /etc/asterisk \
      /opt/avantiqo \
      /var/cache/asterisk \
      /var/lib/asterisk \
      /var/log/asterisk \
      /var/run/asterisk \
      /var/spool/asterisk \
    && sh -eu -c '/usr/sbin/asterisk -f -U asterisk -G asterisk -vvv >/tmp/asterisk-startup.log 2>&1 & pid=$!; sleep 3; if ! kill -0 "$pid" 2>/dev/null; then cat /tmp/asterisk-startup.log; wait "$pid" || true; exit 1; fi; kill -TERM "$pid"; wait "$pid" || true; rm -f /tmp/asterisk-startup.log'

EXPOSE 5038/tcp 5060/udp 5060/tcp

ENTRYPOINT ["/usr/bin/tini","--","/usr/local/bin/avantiqo-asterisk-entrypoint"]
CMD ["/usr/sbin/asterisk","-f","-U","asterisk","-G","asterisk","-vvv"]
