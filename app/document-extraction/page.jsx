import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Turn files into usable business context. | Avantiqo', description: 'OCR, extraction, classification and validation connect documents to the business records and workflows that actually need the information.' };

const config = {
  context: 'Documents',
  audience: 'business',
  eyebrow: 'AVANTIQO / DOCUMENT EXTRACTION',
  title: 'Turn files into usable business context.',
  lead: 'OCR, extraction, classification and validation connect documents to the business records and workflows that actually need the information.',
  primary: 'Explore Documents',
  primaryHref: '/documents',
  image: '/art/commercial-integrations.jpg',
  panelLabel: 'DOCUMENT INTELLIGENCE',
  panel: 'Extracted data stays connected to organization, entity, workflow and source evidence.',
  tags: ['OCR', 'EXTRACT', 'CLASSIFY', 'VALIDATE'],
  valueTitle: 'Document understanding that leads somewhere useful.',
  value: [('OCR & extraction', 'Read text, fields, tables and structured values from files.'), ('Classification', 'Identify document type and relevant business context.'), ('Workflow handoff', 'Send validated data into finance, operations or other capabilities.')],
  steps: [('Upload', 'Bring in PDF, image or supported file.'), ('Read', 'Extract text and structured values.'), ('Validate', 'Check identity, context and important fields.'), ('Route', 'Hand off to the correct business workflow.')],
  cta: 'Move from document extraction to business execution.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
