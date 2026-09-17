import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'From campaign brief to finished asset system. | Avantiqo', description: 'Coordinate research, concept development, art direction, image, video, music, review, repair and delivery as one commercial campaign mission.' };

const config = {
  context: 'Creative Studios',
  audience: 'creative',
  eyebrow: 'AVANTIQO / CAMPAIGN PRODUCTION',
  title: 'From campaign brief to finished asset system.',
  lead: 'Coordinate research, concept development, art direction, image, video, music, review, repair and delivery as one commercial campaign mission.',
  primary: 'Explore Creative Studios',
  primaryHref: '/creative-studios',
  image: '/art/creative-image.jpg',
  panelLabel: 'CAMPAIGN MISSION',
  panel: 'One brief can become a complete coordinated visual, video and audio campaign system.',
  tags: ['RESEARCH', 'DIRECTION', 'IMAGE', 'VIDEO'],
  valueTitle: 'Buy the campaign outcome, not isolated media calls.',
  value: [('Campaign direction', 'Turn business objectives into a coherent creative direction.'), ('Multi-format production', 'Coordinate image, video, music and derivative assets.'), ('Review & delivery', 'Critique, repair, brand-check and package final commercial assets.')],
  steps: [('Brief', 'Define objective, audience and required outputs.'), ('Concept', 'Research and develop the campaign direction.'), ('Produce', 'Create coordinated assets across studios.'), ('Deliver', 'Review, repair and package the final campaign.')],
  cta: 'Create a campaign that feels directed as one system.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
