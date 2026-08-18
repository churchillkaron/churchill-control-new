import { jsPDF } from "jspdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 960;
const H = 540;
const C = {
  bg: [7, 7, 8],
  panel: [15, 15, 17],
  panel2: [20, 18, 15],
  gold: [222, 169, 92],
  gold2: [246, 207, 145],
  white: [245, 244, 241],
  muted: [170, 168, 164],
  dim: [105, 104, 101],
  green: [142, 202, 104],
};

function bg(doc) {
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(78, 58, 29);
  doc.setLineWidth(0.6);
  doc.line(34, 505, 926, 505);
}

function brand(doc, slide) {
  doc.setTextColor(...C.gold2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("AVANTIQO", 36, 34);
  doc.setTextColor(...C.gold);
  doc.setFontSize(7.5);
  doc.setCharSpace(2.4);
  doc.text("SYNTHETIC INTELLIGENCE OS", 36, 48);
  doc.setCharSpace(0);
  doc.setTextColor(...C.dim);
  doc.setFontSize(8);
  doc.text(String(slide).padStart(2, "0"), 910, 516);
}

function footer(doc) {
  doc.setTextColor(...C.gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setCharSpace(4);
  doc.text("CREATE.  OPERATE.  SCALE.", W / 2, 521, { align: "center" });
  doc.setCharSpace(0);
}

function title(doc, text, y = 95, size = 34, maxWidth = 860) {
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, 44, y);
  return y + lines.length * (size * 1.02);
}

function subtitle(doc, text, y, maxWidth = 860) {
  doc.setTextColor(...C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13.5);
  doc.text(doc.splitTextToSize(text, maxWidth), 46, y);
}

function panel(doc, x, y, w, h, radius = 10) {
  doc.setFillColor(...C.panel);
  doc.setDrawColor(80, 60, 34);
  doc.setLineWidth(0.65);
  doc.roundedRect(x, y, w, h, radius, radius, "FD");
}

function smallLabel(doc, text, x, y) {
  doc.setTextColor(...C.gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setCharSpace(2.1);
  doc.text(text.toUpperCase(), x, y);
  doc.setCharSpace(0);
}

function bullet(doc, text, x, y, width = 420, color = C.white) {
  doc.setFillColor(...C.gold);
  doc.circle(x, y - 4, 2.4, "F");
  doc.setTextColor(...color);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.text(doc.splitTextToSize(text, width), x + 14, y);
}

function pill(doc, text, x, y, w) {
  doc.setFillColor(12, 12, 13);
  doc.setDrawColor(108, 77, 35);
  doc.roundedRect(x, y, w, 28, 14, 14, "FD");
  doc.setTextColor(...C.gold2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(text, x + w / 2, y + 18, { align: "center" });
}

function addPage(doc, n) {
  if (n > 1) doc.addPage([W, H], "landscape");
  bg(doc);
  brand(doc, n);
  footer(doc);
}

function cover(doc) {
  addPage(doc, 1);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(48);
  doc.text("Avantiqo", 52, 165);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.text("AI-native Business Operating System", 54, 202);
  doc.setDrawColor(...C.gold);
  doc.setLineWidth(1.2);
  doc.line(54, 228, 230, 228);
  doc.setFillColor(...C.gold);
  doc.circle(239, 228, 3, "F");
  subtitle(doc, "One platform to run finance, operations, customers, people, supply chain, compliance and AI execution across multiple companies and industries.", 270, 420);
  pill(doc, "LIVE PRODUCT - BUILT INSIDE REAL OPERATING BUSINESSES", 54, 352, 390);

  panel(doc, 530, 88, 365, 330, 14);
  smallLabel(doc, "One organization intelligence layer", 556, 120);
  doc.setTextColor(...C.white);
  doc.setFont("times", "normal");
  doc.setFontSize(23);
  doc.text("Ask. Decide. Execute.", 556, 155);
  const cards = [
    ["COMMERCIAL", "Customers, communications, marketing"],
    ["OPERATIONS", "Service, hospitality, projects, execution"],
    ["FINANCE", "Accounting, cash, controls, reporting"],
    ["SUPPLY CHAIN", "Procurement, inventory, warehouse"],
    ["PEOPLE + COMPLIANCE", "Workforce, assets, obligations"],
  ];
  cards.forEach((c, i) => {
    const y = 187 + i * 44;
    doc.setFillColor(10, 10, 11);
    doc.setDrawColor(65, 53, 37);
    doc.roundedRect(556, y, 310, 32, 6, 6, "FD");
    doc.setTextColor(...C.gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(c[0], 570, y + 13);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(c[1], 570, y + 25);
  });
}

function problem(doc) {
  addPage(doc, 2);
  title(doc, "The operating system problem", 100, 39, 430);
  subtitle(doc, "Most businesses still run on disconnected tools instead of a real operating system.", 182, 390);
  bullet(doc, "Disconnected apps, spreadsheets and chat threads", 58, 244, 370);
  bullet(doc, "Critical know-how lives in the owner's head and staff memory", 58, 294, 370);
  bullet(doc, "Generic software records data but does not run the operation", 58, 354, 370);
  bullet(doc, "Every extra tool adds cost, fragmentation and control risk", 58, 414, 370);

  const nodes = [
    ["SALES", 626, 98], ["FINANCE", 792, 194], ["COMPLIANCE", 754, 334],
    ["CUSTOMER", 574, 394], ["INVENTORY", 455, 316], ["OPERATIONS", 460, 168], ["PEOPLE", 625, 252],
  ];
  doc.setDrawColor(142, 101, 44);
  doc.setLineWidth(1);
  const center = [662, 270];
  nodes.forEach(([label, x, y]) => {
    doc.setLineDashPattern([5, 5], 0);
    doc.line(center[0], center[1], x + 48, y + 28);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(14, 14, 15);
    doc.setDrawColor(114, 82, 40);
    doc.roundedRect(x, y, 96, 55, 8, 8, "FD");
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(label, x + 48, y + 32, { align: "center" });
  });
  panel(doc, 450, 458, 414, 34, 12);
  doc.setTextColor(...C.gold2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("Result: slow execution, weak visibility and no real operating intelligence.", 657, 479, { align: "center" });
}

function solution(doc) {
  addPage(doc, 3);
  title(doc, "Avantiqo is the AI-native operating layer", 100, 38, 790);
  subtitle(doc, "One platform to ask, decide, execute and expand across the business.", 170, 720);
  const cards = [
    ["ORGANIZATION INTELLIGENCE", "AI understands the company context, explains what is happening and prepares actions."],
    ["DOMAIN WORKSPACES", "Commercial, Operations, Supply Chain, Finance, People, Compliance, Documents and Administration."],
    ["CONNECTED EXECUTION", "The platform moves from insight to governed action, approvals and recorded business events."],
    ["MULTI-COMPANY CONTROL", "One operating model across businesses, locations, legal entities and operating contexts."],
  ];
  cards.forEach((c, i) => {
    const x = 46 + i * 222;
    panel(doc, x, 220, 202, 196, 11);
    smallLabel(doc, String(i + 1).padStart(2, "0"), x + 18, 245);
    doc.setTextColor(...C.white);
    doc.setFont("times", "normal");
    doc.setFontSize(18);
    doc.text(doc.splitTextToSize(c[0], 166), x + 18, 280);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(c[1], 166), x + 18, 330);
  });
  pill(doc, "ONE PLATFORM. ALL CORE DOMAINS. ONE AI LAYER.", 250, 443, 460);
}

function workspaces(doc) {
  addPage(doc, 4);
  title(doc, "One platform. Many workspaces.", 95, 38, 760);
  subtitle(doc, "Each workspace is a controlled business capability inside one shared operating system.", 155, 760);
  panel(doc, 220, 204, 520, 230, 14);
  smallLabel(doc, "Shared operating core", 246, 232);
  const domains = ["Commercial", "Operations", "Supply Chain", "Finance", "People", "Compliance", "Documents", "Administration"];
  domains.forEach((d, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 246 + col * 118;
    const y = 264 + row * 76;
    doc.setFillColor(9, 9, 10);
    doc.setDrawColor(66, 54, 39);
    doc.roundedRect(x, y, 104, 56, 8, 8, "FD");
    doc.setTextColor(...C.gold2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text(d, x + 52, y + 31, { align: "center" });
  });
  const left = [["ONE IDENTITY", "One search, one business context"], ["CONTROLLED", "Permissions and domain boundaries"]];
  left.forEach((c, i) => {
    panel(doc, 48, 222 + i * 108, 142, 82, 10);
    smallLabel(doc, c[0], 64, 246 + i * 108);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(c[1], 108), 64, 270 + i * 108);
  });
  const right = [["REUSABLE", "Built once, configured by industry"], ["SHARED AI", "Context-aware intelligence everywhere"]];
  right.forEach((c, i) => {
    panel(doc, 770, 222 + i * 108, 142, 82, 10);
    smallLabel(doc, c[0], 786, 246 + i * 108);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(c[1], 108), 786, 270 + i * 108);
  });
}

function live(doc) {
  addPage(doc, 5);
  smallLabel(doc, "Product in action", 46, 88);
  title(doc, "Already live across real workflows", 126, 37, 390);
  subtitle(doc, "These are the operating areas currently being shaped inside the working system - not concept categories.", 238, 355);
  const items = [
    ["CUSTOMER COMMUNICATION", "Unified customer conversations across connected channels"],
    ["AI CAMPAIGN BUILDER", "Strategy, targeting, channel, budget and owner approval"],
    ["RESTAURANT OPERATIONS", "POS, tables, kitchen, mobile service and control"],
    ["FIELD SERVICE", "Service plans, orders, appointments, dispatch and evidence"],
    ["SUPPLY CHAIN", "Procurement, inventory, receiving, warehouse and matching"],
    ["COMPLIANCE", "Assets, insurance, licenses, permits, contracts and renewals"],
  ];
  items.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 428 + col * 164;
    const y = 108 + row * 166;
    panel(doc, x, y, 148, 144, 10);
    smallLabel(doc, c[0], x + 14, y + 24);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(doc.splitTextToSize(c[1], 118), x + 14, y + 58);
    doc.setTextColor(...C.green);
    doc.setFontSize(8.5);
    doc.text("WORKING PLATFORM", x + 14, y + 123);
  });
  pill(doc, "BUILT INSIDE REAL OPERATING ENVIRONMENTS", 70, 389, 300);
}

function expansion(doc) {
  addPage(doc, 6);
  title(doc, "Vertical entry, horizontal expansion", 95, 38, 700);
  subtitle(doc, "Land with one mission-critical workflow, then expand across the company.", 155, 700);
  const steps = [
    ["1", "Solve one critical workflow", "Example: service plans, service orders, dispatch, assignments and proof of service."],
    ["2", "Expand into adjacent control layers", "Add commercial, people, inventory, finance, compliance and communications."],
    ["3", "Become the business operating system", "One platform, one identity, one AI layer and one connected operating context."],
  ];
  steps.forEach((s, i) => {
    const y = 208 + i * 92;
    panel(doc, 480, y, 390, 76, 11);
    doc.setTextColor(...C.gold);
    doc.setFont("times", "normal");
    doc.setFontSize(26);
    doc.text(s[0], 506, y + 43);
    doc.setTextColor(...C.gold2);
    doc.setFont("times", "normal");
    doc.setFontSize(17);
    doc.text(s[1], 546, y + 28);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(s[2], 300), 546, y + 49);
  });
  panel(doc, 52, 220, 354, 238, 14);
  smallLabel(doc, "Example wedge", 76, 248);
  doc.setTextColor(...C.white);
  doc.setFont("times", "normal");
  doc.setFontSize(25);
  doc.text("Field service", 76, 285);
  const wedge = ["Recurring service plans", "Appointment windows", "Dispatch and technician assignment", "Service evidence", "Inventory and finance connection"];
  wedge.forEach((t, i) => bullet(doc, t, 82, 325 + i * 28, 270, i === 4 ? C.gold2 : C.muted));
}

function industries(doc) {
  addPage(doc, 7);
  title(doc, "A horizontal platform with vertical go-to-market", 95, 36, 830);
  subtitle(doc, "The same operating core can power very different industries while preserving industry-specific workflows.", 155, 820);
  panel(doc, 50, 205, 400, 240, 14);
  panel(doc, 510, 205, 400, 240, 14);
  smallLabel(doc, "Where we start", 76, 235);
  smallLabel(doc, "Where the platform can go", 536, 235);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(24);
  doc.text("Hospitality + service", 76, 276);
  doc.text("Multiple industries", 536, 276);
  const left = ["Restaurants and hospitality", "Field service and local service", "Owner-led and multi-location operators"];
  left.forEach((t, i) => bullet(doc, t, 82, 318 + i * 42, 310, C.white));
  const right = ["Healthcare operations", "Retail and commerce", "Construction and projects", "Professional services", "Multi-company groups"];
  right.forEach((t, i) => bullet(doc, t, 542, 314 + i * 31, 310, C.white));
  pill(doc, "EVERY BUSINESS STILL NEEDS CUSTOMERS, OPERATIONS, FINANCE, PEOPLE, COMPLIANCE AND EXECUTION", 125, 462, 710);
}

function model(doc) {
  addPage(doc, 8);
  title(doc, "Land small. Expand across the company.", 95, 38, 760);
  subtitle(doc, "The business model combines recurring software, implementation and AI-driven execution.", 155, 760);
  smallLabel(doc, "Revenue model", 54, 214);
  const rev = [
    ["SUBSCRIPTION SAAS", "Recurring access to organizations and workspaces."],
    ["IMPLEMENTATION", "Configuration, onboarding, integrations and setup."],
    ["AI EXECUTION", "Automation, publishing, communications and future agent actions."],
  ];
  rev.forEach((c, i) => {
    const x = 54 + i * 160;
    panel(doc, x, 236, 144, 178, 10);
    smallLabel(doc, c[0], x + 14, 260);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(c[1], 112), x + 14, 300);
  });
  smallLabel(doc, "Go-to-market", 560, 214);
  panel(doc, 550, 236, 350, 178, 10);
  const gtm = [
    "Founder-led sales into real operating businesses",
    "Start with one vertical solution or critical workspace",
    "Expand account value across adjacent domains",
    "Use own operating environments as high-quality test beds",
  ];
  gtm.forEach((t, i) => bullet(doc, t, 578, 274 + i * 36, 285, C.white));
}

function founder(doc) {
  addPage(doc, 9);
  title(doc, "Built from operator pain, not software theory", 98, 38, 650);
  subtitle(doc, "Avantiqo is being shaped inside real businesses before broad scale.", 160, 620);
  const founderBullets = [
    "Entrepreneur and business owner since age 18",
    "Built and operated companies in Sweden and Thailand",
    "Experience across construction, farming, hotels, restaurants, bars, nightclubs and services",
    "Designed Avantiqo after repeatedly living the same fragmentation, control and visibility problems",
  ];
  founderBullets.forEach((t, i) => bullet(doc, t, 58, 226 + i * 52, 500, C.white));
  panel(doc, 610, 188, 280, 244, 14);
  smallLabel(doc, "Founder-market fit", 636, 220);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(28);
  doc.text("Patric Vallgarda", 636, 265);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FOUNDER - AVANTIQO", 636, 294);
  doc.setTextColor(...C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize("I did not discover this problem in a market report. I have been living it throughout my entrepreneurial career.", 220), 636, 330);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "italic");
  doc.setFontSize(15);
  doc.text(doc.splitTextToSize("Avantiqo is the system I always wished existed.", 220), 636, 390);
}

function raise(doc) {
  addPage(doc, 10);
  title(doc, "Raising $500k to accelerate Avantiqo", 125, 41, 500);
  subtitle(doc, "Capital to deepen the product, prove repeatable deployments and expand execution capability.", 230, 445);
  panel(doc, 590, 86, 320, 108, 14);
  smallLabel(doc, "Raise", 620, 116);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(36);
  doc.text("$500,000", 620, 165);
  smallLabel(doc, "Target valuation", 770, 116);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(25);
  doc.text("$4.0M", 770, 165);

  smallLabel(doc, "Use of funds", 590, 230);
  const funds = [
    ["PRODUCT + ENGINEERING", "Deepen core workflows and platform reliability"],
    ["LIGHTHOUSE CUSTOMERS", "Prove repeatable value across key use cases"],
    ["AI EXECUTION", "Expand integrations, automation and intelligence"],
    ["SALES + PILOT DELIVERY", "Build pipeline and execution velocity"],
  ];
  funds.forEach((f, i) => {
    const x = 590 + (i % 2) * 160;
    const y = 248 + Math.floor(i / 2) * 104;
    panel(doc, x, y, 148, 90, 9);
    smallLabel(doc, f[0], x + 12, y + 22);
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.text(doc.splitTextToSize(f[1], 120), x + 12, y + 48);
  });

  pill(doc, "NEXT: COMMERCIAL LAUNCH -> REPEATABLE CUSTOMER ADOPTION -> SEED READINESS", 94, 384, 420);
  doc.setTextColor(...C.gold2);
  doc.setFont("times", "normal");
  doc.setFontSize(20);
  doc.text("avantiqo.ai", 94, 447);
}

function buildDeck() {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [W, H], compress: true });
  doc.setProperties({
    title: "Avantiqo Investor Pitch Deck",
    subject: "Avantiqo AI-native Business Operating System",
    author: "Patric Vallgarda",
    creator: "Avantiqo",
  });
  cover(doc);
  problem(doc);
  solution(doc);
  workspaces(doc);
  live(doc);
  expansion(doc);
  industries(doc);
  model(doc);
  founder(doc);
  raise(doc);
  return doc;
}

export async function GET() {
  const doc = buildDeck();
  const bytes = Buffer.from(doc.output("arraybuffer"));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Avantiqo_Investor_Pitch_Deck.pdf"',
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
