export function buildDefaultBusinessProfile(industryId) {

  const defaults = {

    restaurant: {
      industry: "restaurant",
      business_types: ["restaurant"],
      revenue_drivers: ["food", "drinks"],
      customer_motivations: ["dining", "social"],
      operational_focus: [
        "service",
        "kitchen",
        "inventory"
      ],
      marketing_angles: [
        "food",
        "experience",
        "hospitality"
      ]
    },

    hotel: {
      industry: "hotel",
      business_types: ["hotel"],
      revenue_drivers: [
        "rooms",
        "food_beverage",
        "events"
      ],
      customer_motivations: [
        "travel",
        "relaxation",
        "luxury"
      ],
      operational_focus: [
        "occupancy",
        "guest_satisfaction",
        "housekeeping",
        "frontdesk"
      ],
      marketing_angles: [
        "travel",
        "luxury",
        "experience"
      ]
    },

    accounting: {
      industry: "accounting",
      business_types: [
        "accounting_firm"
      ],
      revenue_drivers: [
        "bookkeeping",
        "tax",
        "advisory",
        "audit"
      ],
      customer_motivations: [
        "compliance",
        "accuracy",
        "financial_visibility"
      ],
      operational_focus: [
        "reporting",
        "tax",
        "compliance",
        "client_service"
      ],
      marketing_angles: [
        "trust",
        "expertise",
        "accuracy"
      ]
    },

    construction: {
      industry: "construction",
      business_types: [
        "construction"
      ],
      revenue_drivers: [
        "projects",
        "labor",
        "materials"
      ],
      customer_motivations: [
        "quality",
        "delivery",
        "reliability"
      ],
      operational_focus: [
        "projects",
        "procurement",
        "workforce",
        "cost_control"
      ],
      marketing_angles: [
        "craftsmanship",
        "quality",
        "reliability"
      ]
    },

    entertainment: {
      industry: "entertainment",
      business_types: [
        "entertainment"
      ],
      revenue_drivers: [
        "events",
        "tickets",
        "performances",
        "bookings"
      ],
      customer_motivations: [
        "fun",
        "experience",
        "socializing"
      ],
      operational_focus: [
        "events",
        "audience",
        "bookings"
      ],
      marketing_angles: [
        "experience",
        "lifestyle",
        "community"
      ]
    },

    healthcare: {
      industry: "healthcare",
      business_types: [
        "healthcare"
      ],
      revenue_drivers: [
        "consultations",
        "treatments",
        "procedures"
      ],
      customer_motivations: [
        "health",
        "safety",
        "trust"
      ],
      operational_focus: [
        "patients",
        "clinical_quality",
        "compliance"
      ],
      marketing_angles: [
        "care",
        "trust",
        "outcomes"
      ]
    },

    pest_control: {
      industry: "pest_control",
      business_types: [
        "pest_control"
      ],
      revenue_drivers: [
        "contracts",
        "inspections",
        "treatments"
      ],
      customer_motivations: [
        "protection",
        "cleanliness",
        "prevention"
      ],
      operational_focus: [
        "service_quality",
        "retention",
        "inspections"
      ],
      marketing_angles: [
        "protection",
        "trust",
        "prevention"
      ]
    },

    retail: {
      industry: "retail",
      business_types: [
        "retail"
      ],
      revenue_drivers: [
        "product_sales"
      ],
      customer_motivations: [
        "value",
        "convenience",
        "selection"
      ],
      operational_focus: [
        "inventory",
        "sales",
        "customer_service"
      ],
      marketing_angles: [
        "products",
        "offers",
        "shopping"
      ]
    }

  };

  return defaults[industryId] || {
    industry: industryId,
    business_types: [],
    revenue_drivers: [],
    customer_motivations: [],
    operational_focus: [],
    marketing_angles: []
  };
}
