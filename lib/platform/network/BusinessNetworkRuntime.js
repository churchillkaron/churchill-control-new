export class BusinessNetworkRuntime {
  constructor() {
    this.profiles = new Map();
    this.connections = [];
  }

  registerBusiness(profile) {
    this.profiles.set(profile.id, profile);
  }

  getBusiness(id) {
    return this.profiles.get(id) || null;
  }

  listBusinesses() {
    return [...this.profiles.values()];
  }

  connect(connection) {
    this.connections.push(connection);
  }

  getConnections(businessId) {
    return this.connections.filter(
      c =>
        c.from === businessId ||
        c.to === businessId
    );
  }
}

export const businessNetwork =
  new BusinessNetworkRuntime();
