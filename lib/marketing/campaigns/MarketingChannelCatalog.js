const DEFINITIONS = [
  ["meta","Meta Ads","paid_media","meta","marketing.ads.manage","meta-ads","ACTIVE",["facebook","instagram","messenger","audience_network"],["ENGAGEMENT","WEBSITE","LEADS","WHATSAPP"],["IMAGE","VIDEO","CAROUSEL","STORY","REEL"]],
  ["google_ads","Google Ads","paid_media","google","marketing.google.ads.manage","google-ads","IMPLEMENTATION_REQUIRED",["search","display","youtube","performance_max","shopping","demand_gen","apps"],["WEBSITE","LEADS","CALLS","STORE_VISITS","APP"],["SEARCH","IMAGE","VIDEO","PRODUCT","RESPONSIVE"]],
  ["tiktok_ads","TikTok Ads","paid_media","tiktok","marketing.tiktok.ads.manage","tiktok-ads","IMPLEMENTATION_REQUIRED",["tiktok","pangle"],["WEBSITE","LEADS","APP","VIDEO_VIEWS","SALES"],["VIDEO","SPARK_AD","CAROUSEL"]],
  ["line_ads","LINE Ads","paid_media","line","marketing.line.ads.manage","line-ads","IMPLEMENTATION_REQUIRED",["line"],["WEBSITE","APP","LINE_OFFICIAL_ACCOUNT"],["IMAGE","VIDEO","CAROUSEL"]],
  ["microsoft_ads","Microsoft Advertising","paid_media","microsoft","marketing.microsoft.ads.manage","microsoft-ads","NOT_REGISTERED",["bing","microsoft_audience"],["WEBSITE","LEADS","CALLS","SHOPPING"],["SEARCH","IMAGE","VIDEO","PRODUCT"]],
  ["linkedin_ads","LinkedIn Ads","paid_media","linkedin","marketing.linkedin.ads.manage","linkedin-ads","IMPLEMENTATION_REQUIRED",["linkedin"],["WEBSITE","LEADS","ENGAGEMENT"],["IMAGE","VIDEO","CAROUSEL","DOCUMENT","MESSAGE"]],
  ["pinterest_ads","Pinterest Ads","paid_media","pinterest","marketing.pinterest.ads.manage","pinterest-ads","NOT_REGISTERED",["pinterest"],["WEBSITE","SALES","AWARENESS"],["IMAGE","VIDEO","CAROUSEL","SHOPPING"]],
  ["snapchat_ads","Snapchat Ads","paid_media","snapchat","marketing.snapchat.ads.manage","snapchat-ads","NOT_REGISTERED",["snapchat"],["WEBSITE","APP","LEADS","SALES"],["VIDEO","IMAGE","AR"]],
  ["x_ads","X Ads","paid_media","x","marketing.x.ads.manage","x-ads","IMPLEMENTATION_REQUIRED",["x"],["WEBSITE","ENGAGEMENT","VIDEO_VIEWS","APP"],["TEXT","IMAGE","VIDEO","CAROUSEL"]],
  ["reddit_ads","Reddit Ads","paid_media","reddit","marketing.reddit.ads.manage","reddit-ads","NOT_REGISTERED",["reddit"],["WEBSITE","ENGAGEMENT","APP"],["TEXT","IMAGE","VIDEO","CAROUSEL"]],
  ["amazon_ads","Amazon Ads","paid_media","amazon","marketing.amazon.ads.manage","amazon-ads","NOT_REGISTERED",["sponsored_products","sponsored_brands","display","streaming_tv"],["PRODUCT","STORE","WEBSITE"],["PRODUCT","IMAGE","VIDEO"]],
  ["apple_search_ads","Apple Search Ads","paid_media","apple","marketing.apple.search_ads.manage","apple-search-ads","NOT_REGISTERED",["app_store"],["APP"],["APP"]],
  ["programmatic","Programmatic, CTV & DOOH","paid_media","programmatic","marketing.programmatic.manage","programmatic-media","NOT_REGISTERED",["display","connected_tv","streaming_video","digital_out_of_home"],["WEBSITE","AWARENESS","STORE_VISITS"],["IMAGE","VIDEO","AUDIO","DOOH"]],
  ["email","Email","owned_channel","email","communication.email.send","email-campaigns","IMPLEMENTATION_REQUIRED",["email"],["WEBSITE","REPLY","BOOKING","PURCHASE"],["HTML","TEXT","NEWSLETTER","AUTOMATION"]],
  ["whatsapp","WhatsApp Business","owned_channel","whatsapp","communication.whatsapp.send","whatsapp-messaging","ACTIVE_IF_CONFIGURED",["whatsapp"],["CONVERSATION","BOOKING","PURCHASE","SUPPORT"],["TEMPLATE","TEXT","IMAGE","VIDEO","DOCUMENT"]],
  ["line","LINE Official Account","owned_channel","line","communication.line.send","line-messaging","ACTIVE_IF_CONFIGURED",["line"],["CONVERSATION","FOLLOW","WEBSITE","PURCHASE"],["TEXT","IMAGE","VIDEO","FLEX","RICH_MESSAGE"]],
  ["sms","SMS","owned_channel","sms","communication.sms.send","sms-campaigns","IMPLEMENTATION_REQUIRED",["sms"],["WEBSITE","CALL","REPLY"],["TEXT"]],
  ["push","Push Notifications","owned_channel","push","communication.push.send","push-campaigns","NOT_REGISTERED",["ios","android","web_push","in_app"],["APP","WEBSITE"],["TEXT","IMAGE","DEEP_LINK"]],
  ["telegram","Telegram","owned_channel","telegram","communication.telegram.send","telegram-messaging","ACTIVE_IF_CONFIGURED",["telegram"],["CONVERSATION","CHANNEL","WEBSITE"],["TEXT","IMAGE","VIDEO","DOCUMENT"]],
  ["organic_social","Organic Social","organic","multi","marketing.social.publish","social-publishing","ACTIVE_IF_CONFIGURED",["facebook","instagram","tiktok","youtube","linkedin","x","pinterest","google_business","line","telegram"],["ENGAGEMENT","WEBSITE","CONVERSATION"],["TEXT","IMAGE","VIDEO","STORY","REEL","SHORT"]],
  ["local_discovery","Local Discovery & Reputation","organic","multi","reputation.campaign.manage","reputation-campaigns","IMPLEMENTATION_REQUIRED",["google_business","google_maps","apple_business_connect","bing_places","tripadvisor","yelp","trustpilot"],["DISCOVERY","REVIEWS","VISITS"],["LISTING","POST","REVIEW_REQUEST","RESPONSE"]],
  ["commerce_marketplaces","Commerce & Marketplaces","commerce","multi","commerce.campaign.manage","commerce-campaigns","IMPLEMENTATION_REQUIRED",["google_shopping","meta_catalog","tiktok_shop","amazon","shopee","lazada","shopify","delivery_marketplaces","booking_marketplaces","app_stores"],["PRODUCT","PURCHASE","BOOKING","APP"],["PRODUCT","IMAGE","VIDEO","CATALOG"]],
  ["partnerships_offline","Partnerships & Offline","offline","manual","marketing.offline.manage","offline-campaigns","IMPLEMENTATION_REQUIRED",["influencer","affiliate","referral","sponsorship","events","pr","qr","print","direct_mail","radio","television","outdoor","digital_screens","loyalty"],["AWARENESS","LEADS","VISITS","PURCHASE"],["BRIEF","QR","PRINT","AUDIO","VIDEO","EVENT"]]
];

const CHANNELS = Object.freeze(DEFINITIONS.map(([id,name,kind,provider,capability,service_id,runtime_status,networks,destinations,formats]) => Object.freeze({id,name,kind,provider,capability,service_id,runtime_status,networks:Object.freeze(networks),destinations:Object.freeze(destinations),formats:Object.freeze(formats)})));
const BY_ID = Object.freeze(Object.fromEntries(CHANNELS.map((channel) => [channel.id, channel])));

export function getMarketingChannel(channelId) { return BY_ID[String(channelId || "").trim().toLowerCase()] || null; }
export function listMarketingChannels({ kind = null } = {}) { return CHANNELS.filter((channel) => !kind || channel.kind === kind).map((channel) => ({...channel})); }
export function listExecutableMarketingChannels() { return CHANNELS.filter((channel) => ["ACTIVE","ACTIVE_IF_CONFIGURED"].includes(channel.runtime_status)).map((channel) => ({...channel})); }
export { CHANNELS as MARKETING_CHANNEL_CATALOG };
export default MARKETING_CHANNEL_CATALOG;
