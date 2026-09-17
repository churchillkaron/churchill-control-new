import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Intelligence that can work. | Avantiqo', description: 'Give repeatable business work to governed agents that operate through exact capabilities, scoped authority, approvals, verification and durable proof.' };

const config = {
  context: 'Agents',
  audience: 'business',
  eyebrow: 'AVANTIQO / BUSINESS AUTOMATION AGENTS',
  title: 'Intelligence that can work.',
  lead: 'Give repeatable business work to governed agents that operate through exact capabilities, scoped authority, approvals, verification and durable proof.',
  primary: 'Explore Agents',
  primaryHref: '/agents',
  image: '/art/commercial-agents.jpg',
  panelLabel: 'GOVERNED DIGITAL LABOR',
  panel: 'Automation can research, prepare and execute without gaining authority beyond the user and workflow.',
  tags: ['CONTEXT', 'AUTHORITY', 'ACTION', 'PROOF'],
  valueTitle: 'Automate useful work without giving automation unlimited access.',
  value: [('Specialist agents', 'Package repeatable finance, operations, people, commercial and document work.'), ('Scheduled work', 'Run recurring briefs, monitoring and preparation automatically.'), ('Verified execution', 'Bind mutations to exact capability, scope and independent verification.')],
  steps: [('Context', 'Resolve organization, user, entity and evidence.'), ('Reason', 'Research, plan and prepare the next action.'), ('Authorize', 'Require exact capability and approval where needed.'), ('Verify', 'Check the result and preserve durable proof.')],
  cta: 'Turn business capabilities into governed digital labor.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
