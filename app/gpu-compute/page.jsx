import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Use compute for real workloads. | Avantiqo', description: 'Run inference, rendering, batch and creative workloads on governed Avantiqo compute, with owned capacity first and overflow when specialist hardware or extra scale is required.' };

const config = {
  context: 'Compute',
  audience: 'compute',
  eyebrow: 'AVANTIQO / GPU COMPUTE',
  title: 'Use compute for real workloads.',
  lead: 'Run inference, rendering, batch and creative workloads on governed Avantiqo compute, with owned capacity first and overflow when specialist hardware or extra scale is required.',
  primary: 'Explore Compute',
  primaryHref: '/compute',
  image: '/art/commercial-compute.jpg',
  panelLabel: 'COMPUTE FABRIC',
  panel: 'Internal priority, paid workloads and eligible idle capacity share one scheduler.',
  tags: ['INFERENCE', 'RENDER', 'BATCH', 'GPU'],
  valueTitle: 'Buy workload capacity, not infrastructure complexity.',
  value: [('Inference', 'Run model and intelligence workloads against available capacity.'), ('Creative workloads', 'Support image, video, music and rendering jobs.'), ('Batch & reserved', 'Use metered or reserved compute for predictable demand.')],
  steps: [('Submit', 'Send an approved workload.'), ('Schedule', 'Resolve priority, hardware and available capacity.'), ('Execute', 'Run locally or on approved overflow.'), ('Meter', 'Capture usage, result and evidence.')],
  cta: 'Turn approved workloads into measurable compute usage.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
