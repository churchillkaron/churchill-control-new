import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Use compute for real workloads. | Avantiqo', description: 'Run inference, rendering, batch and creative workloads on available Avantiqo compute, using owned capacity first and adding external hardware when more scale or a specialist GPU is required.' };

const config = {
  context: 'Compute',
  audience: 'compute',
  eyebrow: 'AVANTIQO / GPU COMPUTE',
  title: 'Use compute for real workloads.',
  lead: 'Run inference, rendering, batch and creative workloads on available Avantiqo compute, using owned capacity first and adding external hardware when more scale or a specialist GPU is required.',
  primary: 'Explore Compute',
  primaryHref: '/compute',
  image: '/art/commercial-compute.jpg',
  panelLabel: 'COMPUTE FABRIC',
  panel: 'Your approved workloads are scheduled against available GPU capacity, with overflow when extra or specialist hardware is needed.',
  tags: ['INFERENCE', 'RENDER', 'BATCH', 'GPU'],
  valueTitle: 'Buy workload capacity, not infrastructure complexity.',
  value: [('Inference', 'Run model and intelligence workloads against available capacity.'), ('Creative workloads', 'Support image, video, music and rendering jobs.'), ('Batch & reserved', 'Use metered or reserved compute for predictable demand.')],
  steps: [('Submit', 'Send an approved workload.'), ('Schedule', 'Resolve priority, hardware and available capacity.'), ('Execute', 'Run locally or on approved overflow.'), ('Meter', 'Record usage and return the workload result.')],
  cta: 'Run approved workloads with clear usage and results.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
