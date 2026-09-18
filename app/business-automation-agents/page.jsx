import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Intelligence that can work. | Avantiqo', description: 'Use agents for repeatable business work while keeping organization scope, permissions, approvals and result checks in place.' };

const config = {
  context: 'Agents',
  artKind: 'agents',
  audience: 'business',
  eyebrow: 'AVANTIQO / BUSINESS AUTOMATION AGENTS',
  title: 'Intelligence that can work.',
  lead: 'Use agents for repeatable business work while keeping organization scope, permissions, approvals and result checks in place.',
  primary: 'Explore Agents',
  primaryHref: '/agents',
  image: '/art/commercial-agents.jpg',
  panelLabel: 'CONTROLLED BUSINESS AUTOMATION',
  panel: 'Agents can research, prepare and carry out approved work without receiving broader access than the workflow allows.',
  tags: ['CONTEXT', 'PERMISSIONS', 'ACTION', 'REVIEW'],
  valueTitle: 'Automate useful work without giving automation unlimited access.',
  value: [('Specialist agents', 'Use specialist agents for repeatable finance, operations, people, commercial and document work.'), ('Scheduled work', 'Run recurring briefs, monitoring and preparation automatically.'), ('Verified execution', 'Keep important changes limited to the right workflow, organization scope and verification step.')],
  steps: [('Context', 'Use the right organization, user and business records.'), ('Reason', 'Research, plan and prepare the next action.'), ('Authorize', 'Check permissions and require approval where needed.'), ('Verify', 'Check the result and keep a clear record of what happened.')],
  cta: 'Give repeatable work to agents while keeping permissions, approvals and verification in place.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
