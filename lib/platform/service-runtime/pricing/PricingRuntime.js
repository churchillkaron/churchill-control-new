export class PricingRuntime {
  constructor(rules = {}) {
    this.rules = rules;
  }

  calculate(provider, cost) {
    const rule = this.rules[provider];

    if (!rule) return cost;

    if (rule.type === "markup") {
      return cost * (1 + rule.value / 100);
    }

    if (rule.type === "fixed") {
      return cost + rule.value;
    }

    return cost;
  }
}
