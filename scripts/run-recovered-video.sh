#!/bin/zsh
cd /Users/leynaelizan/Projects/avantiqo-public-art-final
set -a
. ./.env.local
set +a
export AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED=true
export AVANTIQO_LOCAL_DEEP_HIERARCHICAL_ENABLED=true
export CREATIVE_CLIP_RECOVERED_LINEAGE_ONLY=true
export CREATIVE_CLIP_ORGANIZATION_ID=9a148429-b6a0-4bc6-ac83-a35c64fb7045
export CREATIVE_CLIP_SECONDS=60
export CREATIVE_CLIP_REQUEST='Create a 60-second world-class cinematic brand film for Avantiqo. Studio must invent the concept itself. The film must create action, emotion, wonder, tension and curiosity, and end in a natural, powerful, memorable Avantiqo reveal. Avoid generic AI-ad cliches and random generated montage. Generate multiple serious concept directions, critique and select the strongest, establish one governing cinematic idea, define story arc, cinematography, visual language, edit rhythm, sound design, continuity and reveal logic, and reject weak ideas or shots. Benchmark world-class commercial/cinematic direction. Do not follow any supplied plot, storyboard, forest, horror, lightning or shot list unless Studio independently concludes such territory is best.'
export CREATIVE_CLIP_RESEARCH_PROVIDER=avantiqo-intelligence
export CREATIVE_CLIP_RESEARCH_PRICING_ID=4137aed5-8b37-4c9e-beef-c4b9c0d4d85b
export CREATIVE_CLIP_RESEARCH_MODEL='Qwen/Qwen3-4B-GGUF:Q4_K_M'
export CREATIVE_CLIP_RESEARCH_MAXIMUM_THB=30
export CREATIVE_CLIP_DIRECTION_MAXIMUM_THB=40
export CREATIVE_CLIP_TRIBUNAL_MAXIMUM_CALLS=120
export CREATIVE_CLIP_MAXIMUM_THB=120
export CREATIVE_CLIP_SPEND_APPROVED=NO
exec npx --yes tsx --tsconfig jsconfig.json scripts/creative-one-clip.mjs
