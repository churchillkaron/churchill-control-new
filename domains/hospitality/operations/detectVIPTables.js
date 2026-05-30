export default function detectVIPTables(
  tables = []
) {

  return tables.filter(
    (table) => {

      const spend =
        Number(
          table.total_spent || 0
        );

      return spend >= 10000;

    }
  );

}
