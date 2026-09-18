import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Turn invoices into finance work that is ready to review and process. | Avantiqo', description: 'Capture supplier or customer invoice data, validate the key fields, route approvals and send verified information into finance workflows.' };

const config = {
  context: 'Invoice Processing',
  audience: 'business',
  eyebrow: 'AVANTIQO / INVOICE PROCESSING',
  title: 'Turn invoices into finance work that is ready to review and process.',
  lead: 'Capture supplier or customer invoice data, validate the key fields, route approvals and send verified information into finance workflows.',
  primary: 'Explore Business OS',
  primaryHref: '/business',
  image: '/art/commercial-integrations.jpg',
  panelLabel: 'DOCUMENT → FINANCE',
  panel: 'Extraction is only the start. The value is getting verified invoice data into the correct business workflow.',
  tags: ['CAPTURE', 'VALIDATE', 'APPROVE', 'POST'],
  valueTitle: 'Move from document handling to accountable finance execution.',
  value: [('Extract', 'Read invoice fields and supporting information from documents.'), ('Validate', 'Check vendor, currency, tax and the correct organization before processing.'), ('Route & post', 'Send the invoice through the right approvals and finance workflow.')],
  steps: [('Receive', 'Email, upload or connected source supplies the invoice.'), ('Understand', 'Extract and classify the document.'), ('Validate', 'Check the organization, supplier, currency, tax and finance details.'), ('Execute', 'Approve, post and keep the source invoice and processing history attached.')],
  cta: 'Make invoice processing part of the finance operating system.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
