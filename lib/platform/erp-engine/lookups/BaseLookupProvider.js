export default class BaseLookupProvider {

  async getOptions() {
    return [];
  }

  async search() {
    return [];
  }

  async getById() {
    return null;
  }

  async validate(id) {
    return !!id;
  }

}
