"use client";

export default function
GenerationJobsPanel({

  jobs = [],

}) {

  return (

    <div
      className="
        bg-white/5
        border
        border-white/10
        rounded-2xl
        p-5
      "
    >

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.2em]
          text-xs
          mb-5
        "
      >
        Generation Jobs
      </div>

      <div className="space-y-3">

        {jobs.map((job) => (

          <div
            key={job.id}
            className="
              bg-black/30
              border
              border-white/10
              rounded-xl
              p-4
            "
          >

            <div
              className="
                text-white
                text-sm
                mb-1
              "
            >
              {job.engine}
            </div>

            <div
              className={`
                text-xs
                font-semibold

                ${job.status === "completed"
                  ? "text-green-400"
                  : ""}

                ${job.status === "processing"
                  ? "text-yellow-400"
                  : ""}

                ${job.status === "failed"
                  ? "text-red-400"
                  : ""}

                ${job.status === "queued"
                  ? "text-blue-400"
                  : ""}
              `}
            >
              {job.status}
            </div>

            {job.output?.image_url && (

              <img
                src={
                  job.output.image_url
                }
                alt="Generated"
                className="
                  w-full
                  h-40
                  object-cover
                  rounded-xl
                  mt-4
                  border
                  border-white/10
                "
              />

            )}

          </div>

        ))}

      </div>

    </div>

  );

}