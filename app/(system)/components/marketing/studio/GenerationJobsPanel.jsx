"use client";

import { supabase } from "@/lib/supabase";

export default function GenerationJobsPanel({
  jobs = [],
  setJobs,
  setActiveAsset,
}) {
  const openAsset = (job) => {
    if (!setActiveAsset) return;

    const mediaUrl =
      job?.video_url ||
      job?.file_url ||
      job?.image_url ||
      job?.thumbnail_url ||
      null;

    const isVideo =
      job?.engine === "video" ||
      job?.tags?.includes("video") ||
      job?.video_url;

    if (!mediaUrl) return;

    setActiveAsset({
      type: isVideo ? "video" : "image",
      url: mediaUrl,
      asset: job,
    });
  };

  const deleteJob = async (id) => {
    if (!id) return;

    const confirmDelete =
      window.confirm("Delete generation job?");

    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from("marketing_assets")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        return;
      }

      setJobs((prev) =>
        prev.filter((item) => item.id !== id)
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="
        bg-black/30
        border border-white/10
        rounded-2xl
        p-5
      "
    >
      <div
        className="
          text-orange-400
          uppercase
          tracking-[0.2em]
          text-xs
          mb-4
        "
      >
        Generation Jobs
      </div>

      <div
        className="
          max-h-[500px]
          overflow-y-auto
          pr-2
          space-y-4
        "
      >
        {jobs?.length === 0 && (
          <div className="text-white/40 text-sm">
            No generation jobs
          </div>
        )}

        {jobs?.map((job) => {
          const mediaUrl =
            job?.video_url ||
            job?.file_url ||
            job?.image_url ||
            job?.thumbnail_url ||
            null;

          const isVideo =
            job?.engine === "video" ||
            job?.tags?.includes("video") ||
            job?.video_url;

          return (
            <div
              key={job.id}
              className="
                bg-black/40
                border border-white/10
                rounded-2xl
                p-4
                relative
              "
            >
              <button
                onClick={() => deleteJob(job.id)}
                className="
                  absolute
                  top-3
                  right-3
                  w-8
                  h-8
                  rounded-full
                  bg-red-500
                  text-white
                  text-sm
                "
              >
                ×
              </button>

              <div
                onClick={() => openAsset(job)}
                className="
                  w-full
                  h-40
                  rounded-xl
                  overflow-hidden
                  bg-black
                  border border-white/10
                  mb-4
                  cursor-pointer
                "
              >
                {mediaUrl ? (
                  isVideo ? (
                    <video
                      src={mediaUrl}
                      className="
                        w-full
                        h-full
                        object-cover
                      "
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt={job.name}
                      className="
                        w-full
                        h-full
                        object-cover
                      "
                    />
                  )
                ) : (
                  <div
                    className="
                      w-full
                      h-full
                      flex
                      items-center
                      justify-center
                      text-white/30
                    "
                  >
                    No Media
                  </div>
                )}
              </div>

              <div className="text-white text-xl mb-1">
                {job.title || job.name || "AI Campaign"}
              </div>

              <div className="text-orange-400 mb-2">
                {job.engine || "full-ai"}
              </div>

              <div className="text-white/50 text-sm mb-2">
                {job.prompt || "No prompt"}
              </div>

              <div className="text-green-400 text-sm">
                {job.status || "completed"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}