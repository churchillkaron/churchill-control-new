import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'One operating layer for the property. | Avantiqo', description: 'Bring bookings, rooms, housekeeping, maintenance, guest service, people and finance into one shared business context across the hotel.' };

const config = {
  context: 'Hotel',
  audience: 'business',
  eyebrow: 'AVANTIQO / HOTEL OPERATIONS',
  title: 'One operating layer for the property.',
  lead: 'Bring bookings, rooms, housekeeping, maintenance, guest service, people and finance into one shared business context across the hotel.',
  primary: 'Explore hotel solutions',
  primaryHref: '/solutions',
  image: '/art/commercial-enterprise.jpg',
  panelLabel: 'PROPERTY OPERATIONS',
  panel: 'Guests, rooms, teams, revenue and operating evidence move through one governed system.',
  tags: ['ROOMS', 'GUESTS', 'TEAMS', 'REVENUE'],
  valueTitle: 'Operate the property without software islands.',
  value: [('Guest operations', 'Keep bookings, arrivals, requests and service activity connected.'), ('Property teams', 'Coordinate housekeeping, maintenance, staffing and exceptions.'), ('Revenue & finance', 'Connect operational events to billing, payments and reporting.')],
  steps: [('Book', 'Capture the customer and stay context.'), ('Operate', 'Coordinate rooms, staff and service.'), ('Resolve', 'Surface exceptions and next actions.'), ('Settle', 'Connect payment and finance evidence.')],
  cta: 'Give every property team one operating context.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
