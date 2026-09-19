import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'From idea to finished film. | Avantiqo', description: 'Research, story development, direction, shot design, continuity, generation, dailies, repair, edit, VFX, sound, color and final delivery in one production workflow.' };

const config = {
  context: 'Video Studio',
  artKind: 'video-studio',
  audience: 'creative',
  eyebrow: 'AVANTIQO / FILM PRODUCTION',
  title: 'From idea to finished film.',
  lead: 'Research, story development, direction, shot design, continuity, generation, dailies, repair, edit, VFX, sound, color and final delivery in one production workflow.',
  primary: 'Enter Video Studio',
  primaryHref: '/creative-studios/video',
  image: '/art/creative-video.jpg',
  panelLabel: 'VIDEO MISSION',
  panel: 'Take one brief through story, production, review and finishing instead of managing disconnected generations.',
  tags: ['STORY', 'SHOTS', 'DAILIES', 'MASTER'],
  valueTitle: 'A production workflow, not a video generator.',
  value: [('Creative direction', 'Develop story, treatment, structure and visual language before production.'), ('Production control', 'Design shots, continuity and generation with review gates.'), ('Finishing', 'Repair, edit, sound, VFX, color and master the final deliverable.')],
  steps: [('Research & story', 'Define objective, audience and narrative.'), ('Direct & design', 'Build treatment, scenes, shots and continuity.'), ('Produce & review', 'Generate, review dailies and repair weak work.'), ('Finish & deliver', 'Edit, mix, color and master the final asset.')],
  cta: 'Turn a brief into a finished film through one connected production workflow.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
