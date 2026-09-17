import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Turn invoices into governed finance work. | Avantiqo', description: 'Capture supplier or customer invoice data, validate business context, route approvals and preserve the evidence required for finance workflows.' };

const config = {
  context: 'Invoice Processing',
  audience: 'business',
  eyebrow: 'AVANTIQO / INVOICE PROCESSING',
  title: 'Turn invoices into governed finance work.',
  lead: 'Capture supplier or customer invoice data, validate business context, route approvals and preserve the evidence required for finance workflows.',
  primary: 'Explore Business OS',
  primaryHref: '/business',
  image: '/art/commercial-integrations.jpg',
  panelLabel: 'DOCUMENT → FINANCE',
  panel: 'Extraction is only the start. The value is getting verified invoice data into the correct business workflow.',
  tags: ['CAPTURE', 'VALIDATE', 'APPROVE', 'POST'],
  valueTitle: 'Move from document handling to accountable finance execution.',
  value: [('Extract', 'Read invoice fields and supporting evidence from documents.'), ('Validate', 'Resolve vendor, currency, tax and business context before action.'), ('Route & post', 'Send work through approvals and the exact finance capability.')],
  steps: [('Receive', 'Email, upload or connected source supplies the invoice.'), ('Understand', 'Extract and classify the document.'), ('Validate', 'Check exact business and finance context.'), ('Execute', 'Approve, post and preserve durable evidence.')],
  cta: 'Make invoice processing part of the finance operating system.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
