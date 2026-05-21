export default function buildOrderNumber() {

  const date =
    new Date();

  const year =
    date
      .getFullYear()
      .toString()
      .slice(-2);

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  const random =
    Math.floor(
      1000 +
      Math.random() * 9000
    );

  return `ORD-${year}${month}${day}-${random}`;
}
