export default function calculateExpiryDate({
  production_date = new Date(),
  shelf_life_days = 1,
}) {

  const production =
    new Date(
      production_date
    );

  const expiry =
    new Date(
      production
    );

  expiry.setDate(
    expiry.getDate() +
    Number(
      shelf_life_days || 0
    )
  );

  return {

    production_date:
      production.toISOString(),

    expiry_date:
      expiry.toISOString(),
  };
}
