export class PlatformWallet {
  constructor(balance = 0) {
    this.balance = balance;
  }

  authorize(amount) {
    return this.balance >= amount;
  }

  debit(amount) {
    if (!this.authorize(amount)) {
      throw new Error("Insufficient platform balance");
    }

    this.balance -= amount;

    return this.balance;
  }

  credit(amount) {
    this.balance += amount;

    return this.balance;
  }
}
