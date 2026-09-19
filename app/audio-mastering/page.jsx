import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Finish the record, not just the generation. | Avantiqo', description: 'Use the Avantiqo Music Studio workflow for editing, correction, mix review, mastering and final delivery around a complete audio production.' };

const config = {
  context: 'Music Studio',
  artKind: 'music-studio',
  audience: 'creative',
  eyebrow: 'AVANTIQO / AUDIO MASTERING',
  title: 'Finish the record, not just the generation.',
  lead: 'Use the Avantiqo Music Studio workflow for editing, correction, mix review, mastering and final delivery around a complete audio production.',
  primary: 'Enter Music Studio',
  primaryHref: '/creative-studios/music',
  image: '/art/creative-music.jpg',
  panelLabel: 'FINAL AUDIO',
  panel: 'Editing, mix and master belong in the same production system as creation.',
  tags: ['EDIT', 'MIX', 'MASTER', 'DELIVER'],
  valueTitle: 'A complete finishing workflow for release-ready audio.',
  value: [('Edit & repair', 'Clean, correct and prepare material before the final mix.'), ('Mix review', 'Balance and evaluate the production as one record.'), ('Master & deliver', 'Create final release-ready output and delivery versions.')],
  steps: [('Prepare', 'Organize source material and required output.'), ('Repair', 'Correct issues before the final mix.'), ('Mix', 'Balance the record and review the result.'), ('Master', 'Finish and export final deliverables.')],
  cta: 'Take the production all the way to a finished master.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
