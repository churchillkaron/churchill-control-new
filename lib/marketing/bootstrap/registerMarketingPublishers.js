import {
  registerMarketingPublishers,
} from "@/lib/platform/contracts/marketing/MarketingPublishingContract";

import {
  publishToFacebook,
} from "@/lib/marketing/distribution/meta/publishing/publishToFacebook";

import {
  publishToInstagram,
} from "@/lib/marketing/distribution/meta/publishing/publishToInstagram";


registerMarketingPublishers({
  facebook:
    publishToFacebook,

  instagram:
    publishToInstagram,
});
