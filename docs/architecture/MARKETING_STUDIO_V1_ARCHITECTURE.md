# Marketing Studio V1 Architecture

## Purpose

Marketing Studio is the marketing operating system of Avantiqo OS.

It takes approved assets from Design Studio and turns them into campaigns, schedules, publishing actions, analytics, and AI learning.

Marketing Studio does not create general business documents.
Marketing Studio does not own brand identity.
Marketing Studio does not own raw creative production.

## Core Responsibility

Promote things.

## Modules

### 1. Campaign Builder
- Select approved assets
- Choose campaign goal
- Choose audience
- Generate campaign copy
- Build campaign package
- Prepare channel-specific versions

### 2. Content Calendar
- Monthly campaign calendar
- Scheduled posts
- Seasonal campaigns
- Event campaigns
- Low-season campaigns
- Approval status

### 3. Publishing
- Facebook publishing
- Instagram publishing
- Google publishing
- TikTok publishing
- Queue management
- Retry failed posts
- Publish logs

### 4. Social Media
- Connected accounts
- Page health
- Token status
- Platform status
- Post history

### 5. Marketing Automation
- Auto-schedule
- Auto-retry
- Auto-recommend
- Campaign rules
- AI publishing assistant

### 6. Analytics
- Reach
- Impressions
- Likes
- Comments
- Saves
- Shares
- Engagement score
- Campaign performance
- Platform performance

### 7. AI Optimization
- Campaign memory
- Top-performing campaign patterns
- Best asset recommendations
- Best publishing times
- Brand performance learning
- Audience learning

## Data Ownership

Every marketing record must belong to:

- tenant_id
- organization_id
- page_id where relevant
- campaign_id where relevant
- created_by where relevant

## Current Tables

Existing tables currently in use:

- marketing_assets
- marketing_campaigns
- campaign_publish_queue
- campaign_memory
- campaign_publish_logs
- campaign_asset_usage
- generation_jobs

## Future Tables

Recommended future tables:

- marketing_campaigns
- marketing_campaign_versions
- campaign_publish_queue
- campaign_publish_logs
- campaign_performance
- campaign_memory
- marketing_recommendations
- marketing_channel_accounts
- marketing_calendar_items

## Required Architecture

Frontend page
↓
API route
↓
Marketing service
↓
Repository
↓
Supabase

Frontend must not directly insert, update, or delete Supabase rows.

## Marketing Studio Input

Marketing Studio consumes approved assets from Design Studio.

## Marketing Studio Output

Marketing Studio produces:

- campaigns
- queue items
- published posts
- performance records
- AI learning memory
- recommendations

