import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Turn files into usable business data. | Avantiqo', description: 'OCR, extraction, classification and validation turn documents into structured data that can move into the right business workflow.' };

const config = {
  context: 'Documents',
  artKind: 'documents',
  audience: 'business',
  eyebrow: 'AVANTIQO / DOCUMENT EXTRACTION',
  title: 'Turn files into usable business data.',
  lead: 'OCR, extraction, classification and validation turn documents into structured data that can move into the right business workflow.',
  primary: 'Explore Documents',
  primaryHref: '/documents',
  image: '/art/generated/products/products-documents-v1.png',
  panelLabel: 'DOCUMENT INTELLIGENCE',
  panel: 'Extracted data stays connected to the right organization, workflow and source file.',
  tags: ['OCR', 'EXTRACT', 'CLASSIFY', 'VALIDATE'],
  valueTitle: 'Document understanding that leads somewhere useful.',
  value: [('OCR & extraction', 'Read text, fields, tables and structured values from files.'), ('Classification', 'Identify the document type and where the information belongs.'), ('Workflow handoff', 'Send validated data into finance, operations or other capabilities.')],
  steps: [('Upload', 'Bring in PDF, image or supported file.'), ('Read', 'Extract text and structured values.'), ('Validate', 'Check identity, context and important fields.'), ('Route', 'Hand off to the correct business workflow.')],
  cta: 'Move from document extraction to business execution.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
