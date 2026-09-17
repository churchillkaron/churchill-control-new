import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Run the restaurant as one business. | Avantiqo', description: 'Connect service, POS, kitchen, inventory, purchasing, people and finance in one governed operating context instead of managing each area in a separate tool.' };

const config = {
  context: 'Restaurant',
  audience: 'business',
  eyebrow: 'AVANTIQO / RESTAURANT OPERATING SYSTEM',
  title: 'Run the restaurant as one business.',
  lead: 'Connect service, POS, kitchen, inventory, purchasing, people and finance in one governed operating context instead of managing each area in a separate tool.',
  primary: 'Explore restaurant operations',
  primaryHref: '/solutions',
  image: '/bg-hero-restaurant.png',
  panelLabel: 'RESTAURANT OPERATIONS',
  panel: 'Orders, stock, staff, purchasing and finance stay connected to the same business truth.',
  tags: ['POS', 'INVENTORY', 'PEOPLE', 'FINANCE'],
  valueTitle: 'One operating system from table to books.',
  value: [('Service & POS', 'Run guest service and transactions inside the same operating context.'), ('Stock & purchasing', 'Connect recipes, inventory, receiving, suppliers and food cost.'), ('Finance & people', 'Keep revenue, approvals, payroll and operating evidence connected.')],
  steps: [('Operate', 'Capture service, sales and staff activity.'), ('Control', 'Surface stock, cost and operational exceptions.'), ('Approve', 'Route important actions through exact authority.'), ('Close the loop', 'Post evidence back into finance and reporting.')],
  cta: 'Replace disconnected restaurant tools with one operating layer.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
