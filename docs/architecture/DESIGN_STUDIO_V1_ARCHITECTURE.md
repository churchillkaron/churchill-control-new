# Design Studio V1 Architecture

## Purpose

Design Studio is the creative production system of Avantiqo OS.

It creates visual, brand, document, and operational assets for any organization.

Design Studio does not publish campaigns.
Design Studio does not manage Meta.
Design Studio does not run marketing analytics.

## Core Responsibility

Create things.

## Modules

### 1. Brand Studio
- Logos
- Brand colors
- Typography
- Brand rules
- Brand DNA
- Tone of voice
- Visual guidelines

### 2. Asset Studio
- Photos
- Videos
- Logos
- Graphics
- AI-generated assets
- Uploaded files
- Reusable media library

### 3. Creative Studio
- Social media graphics
- Posters
- Flyers
- Menus
- Business cards
- Brochures
- Screens
- Rollups
- Presentations

### 4. Document Studio
- SOP documents
- Checklists
- Training material
- Contracts
- Quotations
- Invoices
- Employee manuals
- Operational procedures

### 5. Template Studio
- Reusable layouts
- Brand templates
- Department templates
- Industry templates
- Organization templates

### 6. AI Design Assistant
- Generate copy
- Generate layouts
- Generate image concepts
- Improve existing creative
- Convert brand rules into templates
- Suggest better asset usage

## Data Ownership

Every design asset must belong to:

- tenant_id
- organization_id
- created_by
- asset_type
- source_type
- status

## Future Tables

Recommended tables:

- creative_assets
- brand_assets
- document_assets
- design_templates
- design_projects
- design_exports
- generation_jobs

## Required Architecture

Frontend page
↓
API route
↓
Design service
↓
Repository
↓
Supabase

Frontend must not directly insert, update, or delete Supabase rows.

## Design Studio Output

Design Studio produces assets.

Marketing Studio consumes approved assets.

## Correct Flow

Design Studio
↓
Asset Library
↓
Marketing Studio
↓
Campaign
↓
Publishing
↓
Analytics

