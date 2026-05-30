import {
  ChefHat,
  Hotel,
  ShoppingBag,
  Wrench,
  Landmark,
  Megaphone,
  Palette,
  Brain,
  Users,
  Package,
  ClipboardList,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

export const MODULE_REGISTRY = [

  // INDUSTRIES

  {
    id: "restaurant",
    type: "industry",
    name: "Restaurant OS",
    icon: ChefHat,
    route: "/floor",
    category: "Operations",
    description:
      "Restaurant operations, POS, kitchen and service.",
  },

  {
    id: "hotel",
    type: "industry",
    name: "Hotel OS",
    icon: Hotel,
    route: "/hotel",
    category: "Operations",
    description:
      "Hotel operations and hospitality management.",
  },

  {
    id: "retail",
    type: "industry",
    name: "Retail OS",
    icon: ShoppingBag,
    route: "/retail",
    category: "Operations",
    description:
      "Retail stores and sales management.",
  },

  {
    id: "construction",
    type: "industry",
    name: "Construction OS",
    icon: Wrench,
    route: "/construction",
    category: "Operations",
    description:
      "Construction project and workforce operations.",
  },

  // CORE ERP

  {
    id: "finance",
    type: "core",
    name: "Finance ERP",
    icon: Landmark,
    route: "/finance",
    category: "ERP",
    description:
      "Accounting, AP, GL, tax and reporting.",
  },

  {
    id: "inventory",
    type: "core",
    name: "Inventory",
    icon: Package,
    route: "/inventory",
    category: "ERP",
    description:
      "Inventory, valuation and stock control.",
  },

  {
    id: "procurement",
    type: "core",
    name: "Procurement",
    icon: ClipboardList,
    route: "/procurement",
    category: "ERP",
    description:
      "Suppliers, purchasing and approvals.",
  },

  {
    id: "payroll",
    type: "core",
    name: "Payroll",
    icon: Users,
    route: "/payroll",
    category: "ERP",
    description:
      "Payroll, labor costing and staff management.",
  },

  // AI + PLATFORM

  {
    id: "marketing",
    type: "platform",
    name: "Marketing AI",
    icon: Megaphone,
    route: "/marketing",
    category: "Platform",
    description:
      "AI campaign generation and publishing.",
  },

  {
    id: "design_studio",
    type: "platform",
    name: "Design Studio",
    icon: Palette,
    route: "/marketing/design",
    category: "Design",
    description:
      "AI creative studio, brand assets and campaign visuals.",
  },

  {
    id: "intelligence",
    type: "platform",
    name: "AI Intelligence",
    icon: Brain,
    route: "/intelligence",
    category: "Platform",
    description:
      "Forecasting, AI recommendations and orchestration.",
  },

  {
    id: "analytics",
    type: "platform",
    name: "Analytics",
    icon: BarChart3,
    route: "/analytics",
    category: "Platform",
    description:
      "Realtime analytics and executive reporting.",
  },

  {
    id: "governance",
    type: "platform",
    name: "Governance",
    icon: ShieldCheck,
    route: "/management",
    category: "Platform",
    description:
      "Approvals, permissions and compliance.",
  },

];
