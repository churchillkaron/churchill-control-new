import {
  createBusinessDomainContract,
  createBoundedContext,
} from "./BusinessDomainContract.js";

export const RestaurantDomainContract =
  createBusinessDomainContract({
    id: "restaurant",
    name: "Restaurant",
    industry: "hospitality",
    status: "ACTIVE",
    boundedContexts: [
      createBoundedContext({
        id: "sessions",
        name: "Sessions",
        documents: [
          "RestaurantSession",
        ],
        aggregates: [
          "RestaurantSessionAggregate",
        ],
        capabilities: [
          "OpenSession",
          "ChangeCustomer",
          "MoveGuests",
          "SplitSessionGroup",
          "CloseSession",
        ],
        workflows: [
          "TableService",
        ],
        events: [
          "RestaurantSessionOpened",
          "RestaurantCustomerChanged",
          "RestaurantSessionClosed",
        ],
      }),
      createBoundedContext({
        id: "orders",
        name: "Orders",
        documents: [
          "RestaurantOrder",
          "RestaurantOrderItem",
        ],
        aggregates: [
          "RestaurantOrderAggregate",
        ],
        capabilities: [
          "CreateRestaurantOrder",
          "AddItem",
          "RemoveItem",
          "UpdateQuantity",
          "ApplyDiscount",
        ],
        workflows: [
          "RestaurantService",
        ],
        events: [
          "RestaurantOrderCreated",
          "RestaurantOrderItemAdded",
          "RestaurantOrderItemRemoved",
          "RestaurantOrderUpdated",
        ],
      }),
      createBoundedContext({
        id: "kitchen",
        name: "Kitchen",
        documents: [
          "KitchenTicket",
        ],
        aggregates: [
          "KitchenTicketAggregate",
        ],
        capabilities: [
          "CreateKitchenTicket",
          "StartPreparation",
          "MarkReady",
          "Complete",
        ],
        workflows: [
          "KitchenProduction",
        ],
        events: [
          "KitchenTicketCreated",
          "KitchenPreparationStarted",
          "KitchenTicketReady",
          "KitchenTicketCompleted",
        ],
      }),
    ],
  });

export const HotelDomainContract =
  createBusinessDomainContract({
    id: "hotel",
    name: "Hotel",
    industry: "hospitality",
    boundedContexts: [
      createBoundedContext({
        id: "reservations",
        name: "Reservations",
        documents: [
          "Reservation",
          "Stay",
          "GuestProfile",
        ],
        aggregates: [
          "ReservationAggregate",
          "StayAggregate",
        ],
        capabilities: [
          "CreateReservation",
          "ConfirmReservation",
          "CheckInGuest",
          "CheckOutGuest",
          "CancelReservation",
        ],
        workflows: [
          "GuestStay",
        ],
        events: [
          "ReservationCreated",
          "ReservationConfirmed",
          "GuestCheckedIn",
          "GuestCheckedOut",
        ],
      }),
      createBoundedContext({
        id: "housekeeping",
        name: "Housekeeping",
        documents: [
          "HousekeepingTask",
          "RoomInspection",
        ],
        aggregates: [
          "HousekeepingTaskAggregate",
        ],
        capabilities: [
          "CreateHousekeepingTask",
          "StartCleaning",
          "MarkRoomClean",
          "ReportRoomIssue",
        ],
        workflows: [
          "RoomTurnover",
        ],
        events: [
          "HousekeepingTaskCreated",
          "RoomMarkedClean",
          "RoomIssueReported",
        ],
      }),
    ],
  });

export const RetailDomainContract =
  createBusinessDomainContract({
    id: "retail",
    name: "Retail",
    industry: "retail",
    boundedContexts: [
      createBoundedContext({
        id: "sales",
        name: "Sales",
        documents: [
          "RetailSale",
          "RetailReturn",
          "CustomerOrder",
        ],
        aggregates: [
          "RetailSaleAggregate",
          "CustomerOrderAggregate",
        ],
        capabilities: [
          "CreateSale",
          "ProcessPayment",
          "ProcessReturn",
          "IssueReceipt",
        ],
        workflows: [
          "RetailCheckout",
        ],
        events: [
          "RetailSaleCreated",
          "RetailPaymentCaptured",
          "RetailReturnProcessed",
        ],
      }),
    ],
  });

export const HealthcareDomainContract =
  createBusinessDomainContract({
    id: "healthcare",
    name: "Healthcare",
    industry: "healthcare",
    boundedContexts: [
      createBoundedContext({
        id: "patients",
        name: "Patients",
        documents: [
          "Patient",
          "Appointment",
          "Consultation",
          "Prescription",
          "MedicalRecord",
          "Invoice",
        ],
        aggregates: [
          "PatientAggregate",
          "AppointmentAggregate",
          "MedicalRecordAggregate",
        ],
        capabilities: [
          "RegisterPatient",
          "BookAppointment",
          "CheckInPatient",
          "RecordConsultation",
          "IssuePrescription",
          "CreateHealthcareInvoice",
        ],
        workflows: [
          "PatientVisit",
        ],
        events: [
          "PatientRegistered",
          "AppointmentBooked",
          "PatientCheckedIn",
          "ConsultationRecorded",
          "PrescriptionIssued",
        ],
      }),
    ],
  });

export const ConstructionDomainContract =
  createBusinessDomainContract({
    id: "construction",
    name: "Construction",
    industry: "construction",
    boundedContexts: [
      createBoundedContext({
        id: "projects",
        name: "Projects",
        documents: [
          "Project",
          "WorkOrder",
          "SiteInspection",
          "MaterialRequest",
          "ProgressClaim",
        ],
        aggregates: [
          "ProjectAggregate",
          "WorkOrderAggregate",
        ],
        capabilities: [
          "CreateProject",
          "CreateWorkOrder",
          "AssignCrew",
          "RequestMaterials",
          "CompleteInspection",
          "IssueProgressClaim",
        ],
        workflows: [
          "ProjectExecution",
        ],
        events: [
          "ProjectCreated",
          "WorkOrderCreated",
          "MaterialsRequested",
          "InspectionCompleted",
          "ProgressClaimIssued",
        ],
      }),
    ],
  });

export const ManufacturingDomainContract =
  createBusinessDomainContract({
    id: "manufacturing",
    name: "Manufacturing",
    industry: "manufacturing",
    boundedContexts: [
      createBoundedContext({
        id: "production",
        name: "Production",
        documents: [
          "ProductionOrder",
          "BillOfMaterials",
          "Routing",
          "WorkCenterJob",
          "QualityInspection",
          "FinishedGoodsReceipt",
        ],
        aggregates: [
          "ProductionOrderAggregate",
          "QualityInspectionAggregate",
        ],
        capabilities: [
          "CreateProductionOrder",
          "ReserveMaterials",
          "StartProduction",
          "CompleteOperation",
          "InspectQuality",
          "ReceiveFinishedGoods",
        ],
        workflows: [
          "ProductionExecution",
        ],
        events: [
          "ProductionOrderCreated",
          "MaterialsReserved",
          "ProductionStarted",
          "QualityInspectionCompleted",
          "FinishedGoodsReceived",
        ],
      }),
    ],
  });

export const PestControlDomainContract =
  createBusinessDomainContract({
    id: "pest-control",
    name: "Pest Control",
    industry: "field-service",
    boundedContexts: [
      createBoundedContext({
        id: "service",
        name: "Service",
        documents: [
          "ServiceContract",
          "Site",
          "Inspection",
          "TreatmentVisit",
          "ChemicalUsage",
          "FollowUp",
        ],
        aggregates: [
          "ServiceContractAggregate",
          "TreatmentVisitAggregate",
        ],
        capabilities: [
          "CreateServiceContract",
          "ScheduleInspection",
          "RecordTreatment",
          "RecordChemicalUsage",
          "ScheduleFollowUp",
          "RenewContract",
        ],
        workflows: [
          "PestTreatmentService",
        ],
        events: [
          "ServiceContractCreated",
          "InspectionScheduled",
          "TreatmentRecorded",
          "ChemicalUsageRecorded",
          "FollowUpScheduled",
        ],
      }),
    ],
  });

export const BusinessDomainContracts = [
  RestaurantDomainContract,
  HotelDomainContract,
  RetailDomainContract,
  HealthcareDomainContract,
  ConstructionDomainContract,
  ManufacturingDomainContract,
  PestControlDomainContract,
];
