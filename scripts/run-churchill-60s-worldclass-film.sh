#!/bin/sh

COMMAND='Create a 60-second landscape brand film for Churchill Restaurant & Bar in Karon, Phuket. The film must tell one causal human story rather than a generic montage: begin with the transition from an ordinary evening outside into the distinctive Churchill world, reveal the venue through real human action and verified evidence, build through food, drinks, free games, service, social connection and live music, create a memorable emotional turn where separate guests become one shared night, and resolve with an earned invitation to visit Churchill. Use verified original Churchill assets only as direct source or factual references; exclude generated posters, campaign layouts, keyframes, crops and derived assets. Preserve the exact approved Churchill logo and all recognisable people, food, venue architecture and products. Create original exact-duration instrumental music and authentic sound design, with no copyrighted imitation and no generated typography or logo inside provider pixels. Final titles and logo must be composited deterministically. Produce a 1920x1080 H.264 master at 30 fps with stereo audio, world-class cinematic realism, natural camera physics, motivated lighting, sophisticated pacing, strong continuity, no filler, no repeated scene purpose, no synthetic AI look, and no public publishing without separate human approval.'

sh scripts/run-creative-command.sh "$COMMAND"
STATUS=$?

echo
echo "CHURCHILL_60S_COMMAND_STATUS=$STATUS"
echo "TERMINAL_REMAINS_OPEN=YES"
echo
printf "Copy the complete result, then press Enter..."
IFS= read -r _

exit "$STATUS"
