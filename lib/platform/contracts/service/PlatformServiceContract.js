export class PlatformServiceContract {

  constructor(service) {

    this.service = service;

  }

  validate() {

    const required = [
      "id",
      "name",
      "execute",
    ];

    for (const field of required) {

      if (!this.service[field]) {

        throw new Error(
          `Service missing ${field}`
        );

      }

    }

    return true;

  }

}
