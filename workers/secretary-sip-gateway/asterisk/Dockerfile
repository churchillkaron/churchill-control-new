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
    && test -f /opt/asterisk-root/usr/lib/asterisk/modules/chan_pjsip.so

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcurl4 \
    libedit2 \
    libjansson4 \
    libncurses6 \
    libspeexdsp1 \
    libsqlite3-0 \
    libssl3 \
    libuuid1 \
    libxml2 \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system asterisk \
    && useradd --system --gid asterisk --home-dir /var/lib/asterisk --shell /usr/sbin/nologin asterisk \
    && mkdir -p /etc/asterisk /var/lib/asterisk /var/log/asterisk /var/run/asterisk /var/spool/asterisk

# Copy only immutable Asterisk install artifacts. Do not copy staged /var/run or other
# runtime filesystem paths over Debian's final-stage symlinks/directories.
COPY --from=builder /opt/asterisk-root/usr/ /usr/
COPY extensions.conf.example /etc/asterisk/extensions.conf
COPY container-entrypoint.sh /usr/local/bin/avantiqo-asterisk-entrypoint

RUN test -x /usr/sbin/asterisk \
    && test -f /usr/lib/asterisk/modules/app_audiosocket.so \
    && test -f /usr/lib/asterisk/modules/res_audiosocket.so \
    && test -f /usr/lib/asterisk/modules/res_pjsip.so \
    && test -f /usr/lib/asterisk/modules/chan_pjsip.so \
    && /usr/sbin/asterisk -V \
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
    && printf '%s\n' \
      '[general]' \
      'static=yes' \
      'writeprotect=yes' \
      'clearglobalvars=no' \
      > /etc/asterisk/extensions-general.conf \
    && chmod 0755 /usr/local/bin/avantiqo-asterisk-entrypoint \
    && chown -R asterisk:asterisk /etc/asterisk /var/lib/asterisk /var/log/asterisk /var/run/asterisk /var/spool/asterisk

EXPOSE 5038/tcp 5060/udp 5060/tcp

ENTRYPOINT ["/usr/bin/tini","--","/usr/local/bin/avantiqo-asterisk-entrypoint"]
CMD ["/usr/sbin/asterisk","-f","-U","asterisk","-G","asterisk","-vvv"]
