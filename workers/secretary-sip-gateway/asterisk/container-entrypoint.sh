#!/bin/sh
set -eu

: "${ASTERISK_AMI_USERNAME:?ASTERISK_AMI_USERNAME required}"
: "${ASTERISK_AMI_SECRET:?ASTERISK_AMI_SECRET required}"

TRUNK_ENDPOINT="${ASTERISK_SECRETARY_TRUNK_ENDPOINT:-}"
TRUNK_HOST="${ASTERISK_SECRETARY_TRUNK_HOST:-}"
TRUNK_PORT="${ASTERISK_SECRETARY_TRUNK_PORT:-5060}"
TRUNK_PROTOCOL="${ASTERISK_SECRETARY_TRUNK_PROTOCOL:-udp}"
TRUNK_USERNAME="${ASTERISK_SECRETARY_TRUNK_USERNAME:-}"
TRUNK_SECRET="${ASTERISK_SECRETARY_TRUNK_SECRET:-}"
TRUNK_REGISTER="${ASTERISK_SECRETARY_TRUNK_REGISTER:-true}"
TRUNK_CLIENT_USER="${ASTERISK_SECRETARY_TRUNK_CLIENT_USER:-${TRUNK_USERNAME}}"
TRUNK_CONTACT_USER="${ASTERISK_SECRETARY_TRUNK_CONTACT_USER:-${TRUNK_CLIENT_USER}}"
TRUNK_IDENTIFY_MATCH="${ASTERISK_SECRETARY_TRUNK_IDENTIFY_MATCH:-${TRUNK_HOST}}"
TRUNK_FROM_USER="${ASTERISK_SECRETARY_TRUNK_FROM_USER:-${TRUNK_CLIENT_USER}}"
TRUNK_CODECS="${ASTERISK_SECRETARY_TRUNK_CODECS:-ulaw,alaw}"
INBOUND_CONTEXT="${ASTERISK_SECRETARY_INBOUND_CONTEXT:-avantiqo-secretary-inbound}"

normalize_bool() {
  case "$1" in
    1|true|TRUE|yes|YES) printf '%s' true ;;
    0|false|FALSE|no|NO) printf '%s' false ;;
    *) return 1 ;;
  esac
}

validate_token() {
  name="$1"
  value="$2"
  case "$value" in
    *[!A-Za-z0-9._:-]*)
      echo "SECRETARY_ASTERISK_CONFIG_ERROR=${name}_INVALID" >&2
      exit 1
      ;;
  esac
}

validate_simple_value() {
  name="$1"
  value="$2"
  case "$value" in
    *[
]*)
      echo "SECRETARY_ASTERISK_CONFIG_ERROR=${name}_INVALID" >&2
      exit 1
      ;;
  esac
}

cat > /etc/asterisk/manager.conf <<EOF
[general]
enabled = yes
webenabled = no
port = 5038
bindaddr = 0.0.0.0

[${ASTERISK_AMI_USERNAME}]
secret = ${ASTERISK_AMI_SECRET}
deny = 0.0.0.0/0.0.0.0
permit = 0.0.0.0/0.0.0.0
read = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
write = system,call,command,agent,user,config,originate,reporting,dialplan
EOF

case "$TRUNK_PROTOCOL" in
  udp|tcp) ;;
  *)
    echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_PROTOCOL_INVALID" >&2
    exit 1
    ;;
esac

case "$TRUNK_PORT" in
  ''|*[!0-9]*)
    echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_PORT_INVALID" >&2
    exit 1
    ;;
esac
if [ "$TRUNK_PORT" -lt 1 ] || [ "$TRUNK_PORT" -gt 65535 ]; then
  echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_PORT_INVALID" >&2
  exit 1
fi

cat > /etc/asterisk/pjsip.conf <<EOF
[global]
type=global
user_agent=Avantiqo Secretary

[avantiqo-secretary-transport]
type=transport
protocol=${TRUNK_PROTOCOL}
bind=0.0.0.0:5060
EOF

TRUNK_CONFIGURED=false
if [ -n "$TRUNK_ENDPOINT$TRUNK_HOST$TRUNK_USERNAME$TRUNK_SECRET" ]; then
  TRUNK_CONFIGURED=true
  if [ -z "$TRUNK_ENDPOINT" ] || [ -z "$TRUNK_HOST" ]; then
    echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_ENDPOINT_OR_HOST_MISSING" >&2
    exit 1
  fi

  validate_token ASTERISK_SECRETARY_TRUNK_ENDPOINT "$TRUNK_ENDPOINT"
  validate_token ASTERISK_SECRETARY_TRUNK_HOST "$TRUNK_HOST"
  validate_simple_value ASTERISK_SECRETARY_TRUNK_USERNAME "$TRUNK_USERNAME"
  validate_simple_value ASTERISK_SECRETARY_TRUNK_SECRET "$TRUNK_SECRET"
  validate_simple_value ASTERISK_SECRETARY_TRUNK_CLIENT_USER "$TRUNK_CLIENT_USER"
  validate_simple_value ASTERISK_SECRETARY_TRUNK_CONTACT_USER "$TRUNK_CONTACT_USER"
  validate_token ASTERISK_SECRETARY_TRUNK_IDENTIFY_MATCH "$TRUNK_IDENTIFY_MATCH"
  validate_simple_value ASTERISK_SECRETARY_TRUNK_FROM_USER "$TRUNK_FROM_USER"
  validate_simple_value ASTERISK_SECRETARY_TRUNK_CODECS "$TRUNK_CODECS"

  REGISTER_ENABLED="$(normalize_bool "$TRUNK_REGISTER")" || {
    echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_REGISTER_INVALID" >&2
    exit 1
  }

  AUTH_ENABLED=false
  if [ -n "$TRUNK_USERNAME$TRUNK_SECRET" ]; then
    if [ -z "$TRUNK_USERNAME" ] || [ -z "$TRUNK_SECRET" ]; then
      echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_AUTH_INCOMPLETE" >&2
      exit 1
    fi
    AUTH_ENABLED=true
  fi

  if [ "$REGISTER_ENABLED" = true ] && { [ "$AUTH_ENABLED" != true ] || [ -z "$TRUNK_CLIENT_USER" ]; }; then
    echo "SECRETARY_ASTERISK_CONFIG_ERROR=ASTERISK_SECRETARY_TRUNK_REGISTRATION_CREDENTIALS_MISSING" >&2
    exit 1
  fi

  {
    printf '\n[%s]\n' "$TRUNK_ENDPOINT"
    printf 'type=aor\n'
    printf 'contact=sip:%s:%s\n' "$TRUNK_HOST" "$TRUNK_PORT"
    printf 'qualify_frequency=30\n'

    if [ "$AUTH_ENABLED" = true ]; then
      printf '\n[%s-auth]\n' "$TRUNK_ENDPOINT"
      printf 'type=auth\n'
      printf 'auth_type=userpass\n'
      printf 'username=%s\n' "$TRUNK_USERNAME"
      printf 'password=%s\n' "$TRUNK_SECRET"
    fi

    printf '\n[%s]\n' "$TRUNK_ENDPOINT"
    printf 'type=endpoint\n'
    printf 'transport=avantiqo-secretary-transport\n'
    printf 'context=%s\n' "$INBOUND_CONTEXT"
    printf 'disallow=all\n'
    printf 'allow=%s\n' "$TRUNK_CODECS"
    printf 'aors=%s\n' "$TRUNK_ENDPOINT"
    if [ "$AUTH_ENABLED" = true ]; then printf 'outbound_auth=%s-auth\n' "$TRUNK_ENDPOINT"; fi
    if [ -n "$TRUNK_FROM_USER" ]; then printf 'from_user=%s\n' "$TRUNK_FROM_USER"; fi
    printf 'from_domain=%s\n' "$TRUNK_HOST"
    printf 'direct_media=no\n'
    printf 'force_rport=yes\n'
    printf 'rewrite_contact=yes\n'
    printf 'rtp_symmetric=yes\n'

    if [ -n "$TRUNK_IDENTIFY_MATCH" ]; then
      printf '\n[%s-identify]\n' "$TRUNK_ENDPOINT"
      printf 'type=identify\n'
      printf 'endpoint=%s\n' "$TRUNK_ENDPOINT"
      printf 'match=%s\n' "$TRUNK_IDENTIFY_MATCH"
    fi

    if [ "$REGISTER_ENABLED" = true ]; then
      printf '\n[%s-registration]\n' "$TRUNK_ENDPOINT"
      printf 'type=registration\n'
      printf 'transport=avantiqo-secretary-transport\n'
      printf 'outbound_auth=%s-auth\n' "$TRUNK_ENDPOINT"
      printf 'server_uri=sip:%s:%s\n' "$TRUNK_HOST" "$TRUNK_PORT"
      printf 'client_uri=sip:%s@%s\n' "$TRUNK_CLIENT_USER" "$TRUNK_HOST"
      if [ -n "$TRUNK_CONTACT_USER" ]; then printf 'contact_user=%s\n' "$TRUNK_CONTACT_USER"; fi
      printf 'retry_interval=60\n'
      printf 'fatal_retry_interval=60\n'
      printf 'forbidden_retry_interval=300\n'
      printf 'max_retries=10\n'
    fi
  } >> /etc/asterisk/pjsip.conf
fi

chmod 0600 /etc/asterisk/manager.conf /etc/asterisk/pjsip.conf
chown asterisk:asterisk /etc/asterisk/manager.conf /etc/asterisk/pjsip.conf

echo "SECRETARY_ASTERISK_TRUNK_CONFIGURED=${TRUNK_CONFIGURED}"
echo "SECRETARY_ASTERISK_TRUNK_SECRET_PRINTED=false"
echo "SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false"

exec "$@"
