# Avantiqo Industry Language Map

## Purpose

One operating system.

Different industries.

Different language.

Same engines.

Same business objects.

Same architecture.

---

# Core Entity: Customer

Restaurant:
- Guest

Hotel:
- Guest

Healthcare:
- Patient

Accounting Firm:
- Client

Retail:
- Customer

---

# Core Entity: Product

Restaurant:
- Menu Item
- Dish
- Combo

Hotel:
- Room
- Package
- Experience
- Add-on

Healthcare:
- Treatment
- Procedure
- Service

Accounting Firm:
- Service Package
- Retainer
- Engagement Package

Retail:
- Product
- Variant
- Bundle

---

# Core Entity: Order

Restaurant:
- Order
- Table Order
- Online Order

Hotel:
- Reservation
- Booking

Healthcare:
- Appointment
- Treatment Plan

Accounting Firm:
- Engagement
- Service Agreement

Retail:
- Order
- Sale

---

# Core Entity: Staff

Restaurant:
- Waiter
- Chef
- Bartender
- Manager

Hotel:
- Receptionist
- Housekeeper
- Concierge
- Manager

Healthcare:
- Doctor
- Nurse
- Therapist
- Admin Staff

Accounting Firm:
- Accountant
- Auditor
- Advisor
- Partner

Retail:
- Cashier
- Store Staff
- Store Manager

---

# Core Entity: Supplier

Restaurant:
- Food Supplier
- Beverage Supplier

Hotel:
- Vendor
- Maintenance Supplier
- Linen Supplier

Healthcare:
- Medical Supplier
- Pharmacy Supplier

Accounting Firm:
- Vendor

Retail:
- Supplier
- Distributor

---

# Core Entity: Location

Restaurant:
- Venue
- Branch
- Table
- Zone

Hotel:
- Property
- Room
- Floor
- Building

Healthcare:
- Clinic
- Ward
- Room
- Bed

Accounting Firm:
- Office
- Client Office

Retail:
- Store
- Warehouse
- Shelf
- Zone

---

# Core Entity: Asset

Restaurant:
- Equipment
- Kitchen Equipment
- POS Terminal

Hotel:
- Room Asset
- Equipment
- Maintenance Asset

Healthcare:
- Medical Equipment
- Room Equipment

Accounting Firm:
- Office Asset
- IT Asset

Retail:
- Store Equipment
- POS Terminal
- Warehouse Equipment

---

# Domain: Commerce

Restaurant:
- Menu
- Dishes
- Modifiers
- Combos
- Pricing

Hotel:
- Rooms
- Packages
- Add-ons
- Experiences
- Rates

Healthcare:
- Treatments
- Procedures
- Service Packages

Accounting Firm:
- Services
- Retainers
- Packages
- Subscriptions

Retail:
- Catalog
- Products
- Variants
- Bundles
- Pricing

---

# Domain: Sales

Restaurant:
- Orders
- Tables
- Payments
- Receipts
- Refunds

Hotel:
- Reservations
- Bookings
- Deposits
- Billing
- Payments

Healthcare:
- Appointments
- Billing
- Claims
- Payments

Accounting Firm:
- Engagements
- Quotes
- Invoices
- Payments

Retail:
- Orders
- Checkout
- Receipts
- Returns
- Payments

---

# Domain: Operations

Restaurant:
- Kitchen
- Expo
- Inventory
- Procurement
- Production

Hotel:
- Front Desk
- Housekeeping
- Maintenance
- Concierge
- Inventory

Healthcare:
- Clinical Operations
- Admissions
- Wards
- Laboratory
- Pharmacy

Accounting Firm:
- Client Work
- Case Operations
- Document Processing

Retail:
- Fulfillment
- Inventory
- Procurement
- Shipping
- Returns

---

# Domain: Workforce

Restaurant:
- Staff
- Shifts
- Attendance
- Payroll
- Service Charge
- Performance

Hotel:
- Staff
- Rosters
- Attendance
- Payroll
- Performance

Healthcare:
- Staff
- Scheduling
- Attendance
- Payroll
- Certifications

Accounting Firm:
- Staff
- Timesheets
- Payroll
- Utilization
- Performance

Retail:
- Staff
- Shifts
- Attendance
- Payroll
- Store Performance

---

# Domain: Customer

Restaurant:
- Guests
- Loyalty
- Reviews
- Guest History

Hotel:
- Guests
- Guest Profiles
- Loyalty
- Reviews

Healthcare:
- Patients
- Patient Records
- Insurance
- Follow-ups

Accounting Firm:
- Clients
- Client Portal
- Client History

Retail:
- Customers
- Loyalty
- Reviews
- Customer History

---

# Domain: Creative

Restaurant:
- Menu Design
- Promotions
- Social Content

Hotel:
- Room Promotions
- Experience Campaigns
- Brand Assets

Healthcare:
- Treatment Materials
- Campaign Assets

Accounting Firm:
- Proposal Design
- Service Brochures
- Brand Assets

Retail:
- Product Content
- Promotions
- Brand Assets

---

# Domain: Marketing

Restaurant:
- Campaigns
- Publishing
- Social Media

Hotel:
- Campaigns
- OTA Promotions
- Publishing

Healthcare:
- Awareness Campaigns
- Patient Campaigns

Accounting Firm:
- Lead Campaigns
- Newsletter
- Thought Leadership

Retail:
- Campaigns
- Promotions
- Social Commerce

---

# Domain: Control

Restaurant:
- Cashflow
- Food Cost
- Accounting
- Service Charge Governance

Hotel:
- Cashflow
- Room Revenue
- Accounting
- Audit

Healthcare:
- Billing Control
- Claims
- Accounting
- Compliance

Accounting Firm:
- Client Profitability
- Accounting
- Compliance

Retail:
- Cashflow
- Inventory Valuation
- Accounting
- Audit

---

# Domain: Intelligence

Restaurant:
- Sales Analytics
- Kitchen Analytics
- Staff Analytics
- Forecasting

Hotel:
- Occupancy Analytics
- RevPAR
- Guest Analytics
- Forecasting

Healthcare:
- Patient Analytics
- Utilization
- Treatment Analytics

Accounting Firm:
- Client Profitability
- Staff Utilization
- Forecasting

Retail:
- Product Analytics
- Sales Analytics
- Inventory Analytics
- Forecasting

---

# Result

Industry changes language.

Industry does not change architecture.

Avantiqo stays one operating system with shared:

- Core entities
- Channels
- Events
- Engines
- Business objects
- Domains
- Capabilities
