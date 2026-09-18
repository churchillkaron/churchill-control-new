import MoneyLandingPage from "@/components/public/MoneyLandingPage";

export const metadata = { title: 'Run the property from one connected hotel workspace. | Avantiqo', description: 'Connect bookings, rooms, housekeeping, maintenance, guest service, people and finance so hotel teams work from the same up-to-date information.' };

const config = {
  context: 'Hotel',
  audience: 'business',
  eyebrow: 'AVANTIQO / HOTEL OPERATIONS',
  title: 'Run the property from one connected hotel workspace.',
  lead: 'Connect bookings, rooms, housekeeping, maintenance, guest service, people and finance so hotel teams work from the same up-to-date information.',
  primary: 'Explore hotel solutions',
  primaryHref: '/solutions',
  image: '/art/commercial-enterprise.jpg',
  panelLabel: 'PROPERTY OPERATIONS',
  panel: 'Keep guest activity, room status, team work, payments and operating records connected.',
  tags: ['ROOMS', 'GUESTS', 'TEAMS', 'REVENUE'],
  valueTitle: 'Keep hotel teams connected instead of splitting work across separate systems.',
  value: [('Guest operations', 'Keep bookings, arrivals, requests and service activity connected.'), ('Property teams', 'Coordinate housekeeping, maintenance, staffing and exceptions.'), ('Revenue & finance', 'Connect operational events to billing, payments and reporting.')],
  steps: [('Book', 'Capture the customer and stay context.'), ('Operate', 'Coordinate rooms, staff and service.'), ('Resolve', 'Surface exceptions and next actions.'), ('Settle', 'Connect payment and finance evidence.')],
  cta: 'Give every property team one operating context.',
};

export default function Page(){ return <MoneyLandingPage config={config}/>; }
