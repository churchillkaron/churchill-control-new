#!/bin/sh
set -eu

: "${ASTERISK_AMI_USERNAME:?ASTERISK_AMI_USERNAME required}"
: "${ASTERISK_AMI_SECRET:?ASTERISK_AMI_SECRET required}"

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

chmod 0600 /etc/asterisk/manager.conf
chown asterisk:asterisk /etc/asterisk/manager.conf

exec "$@"
