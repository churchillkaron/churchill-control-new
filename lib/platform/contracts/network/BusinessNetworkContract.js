export class BusinessNetworkContract {

  constructor(profile) {

    this.profile = profile;

  }

  validate() {

    const required = [
      "id",
      "organization_id",
      "legal_name",
    ];

    for (const field of required) {

      if (!this.profile[field]) {

        throw new Error(
          `Business profile missing ${field}`
        );

      }

    }

    return true;

  }

}
