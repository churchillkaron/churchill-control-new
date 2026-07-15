let facebookPublisher = null;
let instagramPublisher = null;

export function registerMarketingPublishers({
  facebook,
  instagram,
}) {

  facebookPublisher = facebook;
  instagramPublisher = instagram;

}

export async function publishFacebook(payload) {

  if (!facebookPublisher) {
    throw new Error(
      "Facebook publisher not registered"
    );
  }

  return facebookPublisher(payload);

}

export async function publishInstagram(payload) {

  if (!instagramPublisher) {
    throw new Error(
      "Instagram publisher not registered"
    );
  }

  return instagramPublisher(payload);

}
