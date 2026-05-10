"use client";

export default function PublishPanel({

  loading,

  generateAIImage,

  exportRef,

  latestCampaign,

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
        Publish Actions
      </div>

      <div className="space-y-4">

        <button
          onClick={generateAIImage}
          disabled={loading}
          className="
            w-full
            bg-orange-500
            hover:bg-orange-400
            transition-all
            rounded-xl
            p-4
            font-semibold
            text-black
          "
        >

          {loading
            ? "Generating..."
            : "Generate AI"}

        </button>

        <button
          className="
            w-full
            bg-white/10
            hover:bg-white/20
            transition-all
            rounded-xl
            p-4
            font-semibold
          "
        >
          Queue Campaign
        </button>

        <button
          className="
            w-full
            bg-white/10
            hover:bg-white/20
            transition-all
            rounded-xl
            p-4
            font-semibold
          "
        >
          Publish Now
        </button>

      </div>

    </div>

  );

}