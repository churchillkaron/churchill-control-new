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
          <div className="text-xs text-[#817A72]">
            Journal Number
          </div>
          <div>
            {row?.journal_number || "-"}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#817A72]">
            Status
          </div>
          <div>
            {row?.status || "-"}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#817A72]">
            Reference
          </div>
          <div>
            {row?.reference || "-"}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#817A72]">
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
              className="grid grid-cols-3 rounded-xl border border-black/[0.08] p-3"
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
