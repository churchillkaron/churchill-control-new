export class AuditRuntime {
  constructor() {
    this.entries = [];
  }

  write(entry) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

  list() {
    return this.entries;
  }
}
