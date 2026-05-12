export default function OperationsQueueStats({

  publishCounts,

}) {

  return (

    <div>

      <div className="text-lg font-semibold mb-4">
        Publish Queue
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {Object.entries(publishCounts).map(

          ([key, value]) => (

            <div
              key={key}
              className="
                bg-white/5
                border
                border-white/10
                rounded-2xl
                p-5
              "
            >

              <div className="text-white/50 text-xs uppercase">
                {key}
              </div>

              <div className="text-3xl font-bold mt-2">
                {value}
              </div>

            </div>

          )

        )}

      </div>

    </div>

  );

}