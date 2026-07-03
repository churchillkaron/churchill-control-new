export class ProviderContract {

  constructor(definition) {

    this.definition = definition;

  }

  validate() {

    const required = [
      "id",
      "name",
      "type",
      "capabilities",
      "execute",
    ];

    for (const field of required) {

      if (!this.definition[field]) {

        throw new Error(
          `Provider missing ${field}`
        );

      }

    }

    return true;

  }

}
