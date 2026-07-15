"use client";

export default function JournalDetailRenderer({
  data = {},
}) {

  const row =
    data.data || data;

  const lines =
    row?.lines || [];

  return (
    <div className="space-y-6">

      <section className="grid grid-cols-2 gap-4">

        <div>
          <div className="text-xs text-white/40">
            Journal Number
          </div>
          <div>
            {row?.journal_number || "-"}
          </div>
        </div>

        <div>
          <div className="text-xs text-white/40">
            Status
          </div>
          <div>
            {row?.status || "-"}
          </div>
        </div>

        <div>
          <div className="text-xs text-white/40">
            Reference
          </div>
          <div>
            {row?.reference || "-"}
          </div>
        </div>

        <div>
          <div className="text-xs text-white/40">
            Description
          </div>
          <div>
            {row?.description || "-"}
          </div>
        </div>

      </section>


      <section>

        <h3 className="mb-3 text-sm">
          Journal Lines
        </h3>


        <div className="space-y-2">

          {lines.map((line)=>(
            <div
              key={line.id}
              className="grid grid-cols-3 rounded-xl border border-white/10 p-3"
            >

              <div>
                {line.account?.code}
                {" "}
                {line.account?.name}
              </div>

              <div>
                Debit:
                {" "}
                {line.debit}
              </div>

              <div>
                Credit:
                {" "}
                {line.credit}
              </div>

            </div>
          ))}

        </div>

      </section>

    </div>
  );
}
