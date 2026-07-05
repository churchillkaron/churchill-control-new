const metrics =
  new Map();

export const ProviderMetricsRuntime = {

  success({

    provider,

    duration_ms = 0,

  }) {

    const row =
      metrics.get(provider) || {

        provider,

        success: 0,

        failed: 0,

        total_duration: 0,

      };

    row.success++;

    row.total_duration +=
      duration_ms;

    metrics.set(
      provider,
      row,
    );

  },

  failure({

    provider,

    duration_ms = 0,

  }) {

    const row =
      metrics.get(provider) || {

        provider,

        success: 0,

        failed: 0,

        total_duration: 0,

      };

    row.failed++;

    row.total_duration +=
      duration_ms;

    metrics.set(
      provider,
      row,
    );

  },

  list() {

    return Array.from(

      metrics.values(),

    ).map(row => ({

      ...row,

      total:
        row.success +
        row.failed,

      success_rate:

        row.success +
        row.failed

          ? row.success /
            (
              row.success +
              row.failed
            )

          : 1,

      average_duration_ms:

        row.success +
        row.failed

          ? Math.round(

              row.total_duration /

              (
                row.success +
                row.failed
              ),

            )

          : 0,

    }));

  },

};
