import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Separate, edit and rebuild audio inside one studio. | Avantiqo', description: 'Stem and vocal separation can feed editing, remixing, vocal work, restoration and mastering instead of ending as a disconnected utility result.' };

const config = {
  context: 'Music Studio',
  artKind: 'music-studio',
  audience: 'creative',
  eyebrow: 'AVANTIQO / VOCAL SEPARATION',
  title: 'Separate, edit and rebuild audio inside one studio.',
  lead: 'Stem and vocal separation can feed editing, remixing, vocal work, restoration and mastering instead of ending as a disconnected utility result.',
  primary: 'Enter Music Studio',
  primaryHref: '/creative-studios/music',
  image: '/art/creative-music.jpg',
  panelLabel: 'AUDIO WORKFLOW',
  panel: 'Separation is a production step — not the finished product.',
  tags: ['STEMS', 'VOCALS', 'REMIX', 'RESTORE'],
  valueTitle: 'Use separation as part of a complete production workflow.',
  value: [('Stem separation', 'Split source audio into workable production elements.'), ('Vocal workflow', 'Prepare vocals for correction, replacement or remix work.'), ('Production finish', 'Continue into editing, remixing, mix and master.')],
  steps: [('Analyze', 'Inspect the source and desired output.'), ('Separate', 'Create usable stems or vocal material.'), ('Edit', 'Repair, remix or process the result.'), ('Finish', 'Mix, master and deliver the new production.')],
  cta: 'Move beyond stem extraction into finished audio work.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
