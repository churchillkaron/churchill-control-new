# Avantiqo SFX Modal

Owned text-to-sound-effects runtime for `ai.sfx.generate`.

- Infrastructure: Modal, scale-to-zero
- Product model: `avantiqo-sfx-v1`
- Foundation: `OpenMOSS-Team/MOSS-SoundEffect-v2.0`
- Output: 48 kHz WAV to private `creative-assets` storage
- Max generation duration: 30 seconds
- No customer/provider selection and no external API fallback

Deploy with the repository Modal environment and set the resulting HTTPS endpoint as `AVANTIQO_SFX_MODAL_ENDPOINT_URL`. Production routing remains disabled until `AVANTIQO_SFX_ENGINE_CERTIFIED=true`.
