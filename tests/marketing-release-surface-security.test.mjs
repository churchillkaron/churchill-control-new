import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const assetsRoute = read("app/api/marketing/assets/route.js");
const campaignRoute = read("app/api/marketing/campaign/[id]/route.js");
const generateRoute = read("app/api/marketing/generate/route.js");
const deleteAssetRoute = read("app/api/marketing/delete-asset/route.js");
const updateAssetRoute = read("app/api/marketing/update-asset/route.js");
const queuePage = read("app/(system)/workspace/[organizationId]/commercial/marketing/queue/page.js");
const designPage = read("app/(system)/workspace/[organizationId]/commercial/marketing/design/page.js");

const retiredRoutes = [
  "app/api/marketing/create-generation-job-server/route.js",
  "app/api/marketing/process-generation-job/route.js",
  "app/api/marketing/retry-generation-jobs/route.js",
  "app/api/marketing/generation-jobs/[id]/route.js",
  "app/api/marketing/schedule/route.js",
  "app/api/marketing/analyze-asset/route.js",
  "app/api/marketing/video-status/route.js",
  "app/api/marketing/check-video-status/route.js",
  "app/api/marketing/delete-post/route.js",
  "app/api/marketing/process-queue/route.js",
  "app/api/marketing/retry-failed/route.js",
  "app/api/marketing/route.js",
  "app/api/marketing/run-queue/route.js",
  "app/api/marketing/run-retries/route.js",
  "app/api/marketing/save/route.js",
  "app/api/marketing/publish/route.js",
  "app/api/marketing/publish-now/route.js",
  "app/api/marketing/publish-instagram/route.js",
];

test("Marketing asset reads require organization access and exact organization scope", () => {
  assert.match(assetsRoute, /requireOrganizationAccess/);
  assert.match(assetsRoute, /organizationId is required/);
  assert.match(assetsRoute, /\.eq\("organization_id", access\.organizationId\)/);
});

test("Marketing campaign detail cannot fetch by id across organizations and fails with truthful status codes", () => {
  assert.match(campaignRoute, /requireOrganizationAccess/);
  assert.match(campaignRoute, /organizationId is required/);
  assert.match(campaignRoute, /\.eq\("organization_id", access\.organizationId\)/);
  assert.match(campaignRoute, /\.maybeSingle\(\)/);
  assert.match(campaignRoute, /Campaign not found for this organization/);
  assert.match(campaignRoute, /\{ status: 404 \}/);
  assert.match(campaignRoute, /\{ status: 500 \}/);
  assert.match(campaignRoute, /Response\.json\(\{ success: true, data \}\)/);
  assert.doesNotMatch(campaignRoute, /console\.error/);
});

test("Legacy Marketing generation compatibility route requires authenticated generation authority", () => {
  assert.match(generateRoute, /requireOrganizationAccess/);
  assert.match(generateRoute, /creative\.generation/);
  assert.match(generateRoute, /creative\.image\.generate/);
  assert.match(generateRoute, /organization_id:\s*access\.organizationId/);
});

test("Marketing asset mutation routes are organization scoped, permission gated and hide internal 5xx details", () => {
  assert.match(deleteAssetRoute, /requireOrganizationAccess/);
  assert.match(deleteAssetRoute, /Missing organizationId/);
  assert.match(deleteAssetRoute, /\.eq\("organization_id", access\.organizationId\)/);
  assert.match(deleteAssetRoute, /Unable to delete marketing asset/);
  assert.doesNotMatch(deleteAssetRoute, /error:\s*err\.message/);
  assert.match(updateAssetRoute, /requireOrganizationAccess/);
  assert.match(updateAssetRoute, /creative\.asset\.upload/);
  assert.match(updateAssetRoute, /organizationId: access\.organizationId/);
  assert.match(updateAssetRoute, /Unable to update marketing asset/);
  assert.doesNotMatch(updateAssetRoute, /error:\s*err\.message/);
});

test("Marketing asset read and upload routes keep internal server errors private", () => {
  const uploadRoute = read("app/api/marketing/upload-asset/route.js");
  assert.match(assetsRoute, /Unable to load creative assets/);
  assert.doesNotMatch(assetsRoute, /error:\s*err\.message/);
  assert.match(uploadRoute, /status < 500 \? error\.message : "Unable to upload marketing asset"/);
  assert.match(uploadRoute, /MARKETING ASSET UPLOAD ERROR/);
});

test("live Campaign provider lookup routes hide internal 5xx details while preserving actionable 4xx feedback", () => {
  const consent = read("app/api/marketing/channel-consent/route.js");
  const whatsapp = read("app/api/marketing/whatsapp-templates/route.js");
  const pinterest = read("app/api/marketing/pinterest-boards/route.js");
  const tiktok = read("app/api/marketing/tiktok-creator/route.js");
  assert.match(consent, /status < 500 \? error\?\.message/);
  assert.match(consent, /MARKETING CONSENT READ ERROR/);
  assert.match(consent, /MARKETING CONSENT WRITE ERROR/);
  assert.match(whatsapp, /Unable to load WhatsApp templates from the connected account/);
  assert.doesNotMatch(whatsapp, /payload\?\.error\?\.message \|\|/);
  assert.match(pinterest, /status < 500 \? error\?\.message/);
  assert.match(pinterest, /PINTEREST BOARD LOOKUP ERROR/);
  assert.match(tiktok, /status < 500 \? error\?\.message/);
  assert.match(tiktok, /TIKTOK CREATOR LOOKUP ERROR/);
});

test("Campaign Queue is truthful read-only operational visibility", () => {
  assert.match(queuePage, /fetch\("\/api\/marketing\/campaigns"/);
  assert.match(queuePage, /body: JSON\.stringify\(\{ organizationId \}\)/);
  assert.match(queuePage, /Publishing and paid execution remain governed by Campaigns and Creative Publish/);
  assert.doesNotMatch(queuePage, /queueCampaign\(/);
  assert.doesNotMatch(queuePage, /process-queue/);
  assert.doesNotMatch(queuePage, /delete-post/);
});

test("legacy Marketing execution and false-success routes stay retired", () => {
  for (const path of retiredRoutes) {
    const source = read(path);
    assert.match(source, /RETIRED|retired/i, path);
    assert.doesNotMatch(source, /success:\s*true[\s\S]{0,120}(executed|processed|online)/i, path);
  }
});

test("legacy Marketing design route stays on the canonical Commercial Design studio", () => {
  assert.match(designPage, /commercial\/design/);
});

test("Brand evidence replacement requires explicit creative asset authority", () => {
  const upload = read("app/api/creative/brand/onboarding-upload/route.js");
  assert.match(upload, /requiredAnyPermission: \["creative\.asset\.upload", "creative\.\*"\]/);
  assert.match(upload, /organizationId: access\.organizationId/);
});

test("Marketing intelligence and managed-media control keep organization bindings exact and 5xx details private", () => {
  const intelligence = read("app/api/marketing/campaign-intelligence/route.js");
  const outcomes = read("app/api/marketing/campaign-outcomes/route.js");
  const attribution = read("app/api/marketing/attribution-link/route.js");
  const managedStatus = read("app/api/marketing/meta-ads/[campaignId]/status/route.js");
  assert.match(intelligence, /candidateCampaign\?\.organization_id === member\.organization_id/);
  assert.match(intelligence, /CAMPAIGN INTELLIGENCE ERROR/);
  assert.match(intelligence, /safeStatus < 500 \? error\?\.message/);
  assert.match(outcomes, /CAMPAIGN OUTCOME ERROR/);
  assert.match(outcomes, /safeStatus < 500 \? error\?\.message/);
  assert.match(attribution, /MARKETING ATTRIBUTION LINK ERROR/);
  assert.match(attribution, /safeStatus < 500 \? error\?\.message/);
  assert.match(managedStatus, /MANAGED MEDIA CAMPAIGN ACTION ERROR/);
  assert.match(managedStatus, /status < 500 \? error\?\.message/);
});

test("Paid Media Builder exposes explicit capability-aware view-only behavior", () => {
  const readinessRoute = read("app/api/marketing/campaign-readiness/route.js");
  const adsPage = read("app/(system)/workspace/[organizationId]/commercial/marketing/ads/page.jsx");
  assert.match(readinessRoute, /can_manage_paid_media: hasMarketingPermission\(access, "marketing\.ads\.manage"\)/);
  assert.match(adsPage, /const canManagePaidMedia = readiness\?\.capabilities\?\.can_manage_paid_media === true/);
  assert.match(adsPage, /View only · paid-media planning, provider preflight and campaign creation require the Marketing Ads management permission/);
  assert.match(adsPage, /disabled=\{preflighting \|\| !form\.confirmExactAsset \|\| !canManagePaidMedia\}/);
  assert.match(adsPage, /preflightCurrent && canManagePaidMedia/);
  assert.match(adsPage, /!loading && canManagePaidMedia && !readiness\?\.ready_channel_count/);
});

test("Marketing home exposes only implemented release workspaces", () => {
  const source = read("app/(system)/workspace/[organizationId]/commercial/marketing/page.jsx");
  for (const route of ["campaigns", "dashboard", "ads", "queue", "design", "assets", "brand", "social"]) {
    assert.match(source, new RegExp(`route: \\\"${route}\\\"`));
  }
  for (const route of ["calendar", "live-campaigns", "analytics", "journeys", "reputation", "automation"]) {
    assert.doesNotMatch(source, new RegExp(`route: \\\"${route}\\\"`));
  }
  assert.match(source, /Paid Media Builder/);
  assert.doesNotMatch(source, /Meta Ads Manager/);
  assert.doesNotMatch(source, /value: "CONNECTED"/);
  assert.doesNotMatch(source, /value: "ONLINE"/);
});

test("Creative Asset Library exposes explicit loading error retry and empty states", () => {
  const source = read("app/(system)/workspace/[organizationId]/commercial/marketing/assets/page.js");
  assert.match(source, /Creative Asset Library/);
  assert.match(source, /Unable to load creative assets/);
  assert.match(source, />Retry<\/button>/);
  assert.match(source, /No creative assets yet/);
  assert.match(source, /Preview unavailable/);
  assert.match(source, /\/api\/marketing\/assets\?organizationId=/);
});

test("Marketing compatibility redirects use async Next route params", () => {
  const design = read("app/(system)/workspace/[organizationId]/commercial/marketing/design/page.js");
  const social = read("app/(system)/workspace/[organizationId]/commercial/marketing/social/page.jsx");
  assert.match(design, /export default async function/);
  assert.match(design, /await params/);
  assert.match(social, /export default async function/);
  assert.match(social, /await params/);
});

test("live Marketing pages use readable light-theme success and error states", () => {
  const ads = read("app/(system)/workspace/[organizationId]/commercial/marketing/ads/page.jsx");
  const dashboard = read("app/(system)/workspace/[organizationId]/commercial/marketing/dashboard/page.js");
  const intelligence = read("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/whole/intelligence/page.jsx");
  for (const source of [ads, dashboard, intelligence]) {
    assert.doesNotMatch(source, /text-red-(100|200)/);
    assert.doesNotMatch(source, /text-emerald-(100|200)/);
    assert.doesNotMatch(source, /text-\[#E6C18C\]/);
  }
});
