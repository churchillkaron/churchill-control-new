# AVANTIQO DESIGN AND COMPOSITION ARCHITECTURE

Status: CANONICAL
Owner: Avantiqo Creative Domain
Source of truth: `main`

## Product rule

Avantiqo Studio must be able to create professional posters, ads, banners, flyers, menus, brochures, presentations, documents and other visual communication without asking a generative image model to render the final typography, logos, prices, tables or legal copy inside pixels.

The user sees one Studio. Internally, visual production is split correctly:

CREATIVE PARTNER
-> ART / BRAND / COPY / EXPERIENCE DIRECTION
-> AVANTIQO IMAGE for generated or repaired visual assets
-> AVANTIQO DESIGN & COMPOSITION for exact layout and deterministic finishing
-> QUALITY / REPAIR
-> EXPORT / RELEASE

## Why Image alone is not sufficient

Generative image models are appropriate for photographic, illustrative, environmental, texture, concept and asset-level visual generation. They are not the source of truth for exact copy, typography, logo geometry, pricing, tables, pagination, QR codes, print dimensions or legal text.

Final design therefore remains editable structured composition until export.

## Design & Composition Engine responsibilities

The engine owns:
- canvas and page geometry
- responsive/adaptive layout
- grids, guides, margins, gutters and safe areas
- deterministic text rendering
- exact organization font assets and font-family/style/weight binding
- type hierarchy, kerning, tracking, leading, alignment and text flow
- exact logo/vector placement without generative mutation
- image placement, crop, mask, blend and focal-point control
- shapes, borders, dividers, backgrounds, gradients and vector graphics
- tables, price lists, menus, product grids and structured business data
- icons and approved SVG/vector assets
- QR codes and barcodes from governed source values
- legal copy, disclaimers, CTA and mandatory information
- multi-page flow, headers, footers, page numbers and sections
- bleed, trim, crop marks and print-safe zones
- RGB/CMYK/output color profile handling where required
- accessibility/readability checks where applicable
- deterministic export to PNG/JPEG/SVG/PDF and web-compatible composition formats
- exact evidence of copy, fonts, logos, assets and geometry used in the released artifact

## Deliverable classes

This architecture is deliverable-neutral. Examples include:
- social post / story / carousel
- display and paid-ad creative
- web banners and hero graphics
- posters and flyers
- menus and price lists
- brochures, catalogues and lookbooks
- business cards and stationery
- rollups, signage and screens
- presentations and pitch decks
- quotations, invoices and branded commercial documents
- SOPs, checklists, manuals and training material
- reports, certificates and operational documents
- printable and digital document packages

No industry-specific layout recipe is canonical. Deliverable requirements, organization/brand evidence and director decisions determine the composition.

## Structured design document

Every design remains a structured document until final export. The canonical representation should be able to describe:
- document/page size and units
- page/artboard list
- layer tree and z-order
- text nodes with exact copy and typography bindings
- image/video/graphic nodes with immutable source references
- vector and shape nodes
- layout constraints and alignment relationships
- crop/mask/transform information
- data-bound nodes for prices, products, names, dates and other organization facts
- locked nodes that repairs may not alter
- channel/export requirements
- print requirements
- revision history and approval state

The renderer must not flatten the project early.

## Typography rule

Exact text must be rendered deterministically, not generated as pixels by an image model.

When an organization requires an exact font, the Studio must use a verified font asset or fail closed. Font-family guessing from the host machine is not acceptable proof of exact typography.

Typography quality review must include:
- font correctness
- hierarchy
- readability
- line breaks
- overflow
- orphan/widow control where relevant
- spacing and alignment
- contrast
- legal/minimum-size requirements where supplied

## Logo and brand rule

Approved logos and exact brand marks are immutable source assets unless the mission explicitly concerns brand redesign.

A generative model may create surroundings, backgrounds or supporting imagery, but must not redraw an approved logo when deterministic placement is available.

## Image Engine relationship

Avantiqo Image is an asset worker inside this pipeline. It may:
- generate hero photography or illustration
- edit/re-light/repair a supplied photograph
- remove/replace a background
- inpaint/outpaint visual regions
- generate textures or graphical supporting material
- prepare composition-ready visual assets

It does not own final text layout or exact business information.

## Copy and data truth

Copy comes from approved Creative Partner / Copy Director decisions and organization evidence. Prices, product names, dates, addresses, legal names and other factual business data must come from governed source data when available.

The renderer receives structured content; it may not invent business facts to make a layout fit.

## Multi-format adaptation

A single approved campaign/design direction may produce multiple compositions, for example:
- 1080x1350 social feed
- 1080x1920 story
- square ad
- website hero
- A4 flyer
- A3 poster
- print brochure

Adaptation is not simple resizing. The engine must recompute layout hierarchy, crops, text flow and safe areas while preserving the approved creative idea and brand truth.

## Repair-first rule

Quality failures must produce bounded repair instructions against structured nodes.

Examples:
- move headline, preserve all other nodes
- reduce body copy size within allowed typography range
- replace hero image but preserve copy/layout/logo
- change one price from governed source data
- repair overflow on page 3
- replace an incorrect font binding
- preserve menu structure and update only unavailable products

The Studio must not regenerate an entire poster or brochure merely because one element is wrong.

## Quality gates

Before release the Studio should verify, as applicable:
- exact copy
- spelling and language
- correct organization facts
- font bindings
- logo checksum/source identity
- layout overflow/collision
- margins and safe zones
- image resolution
- crop/focal correctness
- color/contrast
- QR/barcode validity
- table/data completeness
- bleed/trim requirements
- output dimensions and file format
- visual quality / art-direction score
- brand fidelity
- release approval

## Architecture boundary

This is not a new user-facing product and not a vendor/provider selector.

`Avantiqo Design & Composition` is a deterministic/specialist production plane behind Studio. It may use normal rendering technologies and Avantiqo Code workers where appropriate. Generative Image is called only when generation/editing is actually required.

The target experience is simple:

User: "Make a premium new menu for my business."

Studio internally:
-> understands the business and products
-> chooses format and information architecture
-> Art Director creates visual direction
-> Copy/Brand Directors verify copy and brand
-> Image worker generates/repairs needed visuals
-> Design & Composition Engine builds exact pages, typography and pricing
-> Quality rejects defects and dispatches bounded repair
-> Studio returns print-ready and digital masters

The customer should never need to know which image model, renderer, font engine or export worker was used.
