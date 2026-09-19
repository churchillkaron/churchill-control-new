import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Run the restaurant as one business. | Avantiqo', description: 'Connect service, POS, kitchen, inventory, purchasing, people and finance so staff can work from the same restaurant information instead of separate tools.' };

const config = {
  context: 'Restaurant',
  artKind: 'restaurant',
  audience: 'business',
  eyebrow: 'AVANTIQO / RESTAURANT OPERATING SYSTEM',
  title: 'Run the restaurant as one business.',
  lead: 'Connect service, POS, kitchen, inventory, purchasing, people and finance so staff can work from the same restaurant information instead of separate tools.',
  primary: 'Explore restaurant operations',
  primaryHref: '/solutions/restaurant',
  image: '/art/generated/solutions/verticals/solution-restaurant-v1.png',
  panelLabel: 'RESTAURANT OPERATIONS',
  panel: 'Orders, stock, staff, purchasing and finance stay connected to the same business truth.',
  tags: ['POS', 'INVENTORY', 'PEOPLE', 'FINANCE'],
  valueTitle: 'One operating system from table to books.',
  value: [('Service & POS', 'Handle guest service and transactions in one connected restaurant workflow.'), ('Stock & purchasing', 'Connect recipes, inventory, receiving, suppliers and food cost.'), ('Finance & people', 'Keep sales, approvals, payroll and operating records connected.')],
  steps: [('Operate', 'Capture service, sales and staff activity.'), ('Control', 'Surface stock, cost and operational exceptions.'), ('Approve', 'Send important actions to the right person for approval.'), ('Close the loop', 'Carry completed activity into finance and reporting without re-entering the same information.')],
  cta: 'Give the restaurant one connected place to run service, stock, staff and finance.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
