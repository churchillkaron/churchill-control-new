export function generateReceiptNumber() {

  const now =
    new Date();

  const year =
    now
      .getFullYear()
      .toString()
      .slice(-2);

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  const hours =
    String(
      now.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      now.getMinutes()
    ).padStart(2, "0");

  const seconds =
    String(
      now.getSeconds()
    ).padStart(2, "0");

  const random =
    Math.floor(
      Math.random() * 9999
    )
      .toString()
      .padStart(4, "0");

  return `RCPT-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
}
