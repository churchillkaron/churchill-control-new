"use client";

export default function QueuePanel({

  queuedCampaigns = [],

}) {

  return (

    <div
      className="
        bg-white/5
        border
        border-white/10
        rounded-2xl
        p-5
        mt-6
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
        Scheduled Queue
      </div>

      {queuedCampaigns.length === 0 && (

        <div
          className="
            text-white/40
            text-sm
          "
        >
          No queued campaigns yet.
        </div>

      )}

<div
  className="
    space-y-4
    max-h-[320px]
    overflow-auto
    pr-2
  "
>
        {queuedCampaigns.map(
          (item) => {

            const campaign =
              item.marketing_campaigns;

            return (

              <div
                key={item.id}
                className="
                  bg-black/30
                  border
                  border-white/10
                  rounded-2xl
                  p-4
                "
              >

                <div
                  className="
                    text-white
                    font-semibold
                    mb-2
                  "
                >
                  {campaign?.title}
                </div>

                <div
                  className="
                    text-white/50
                    text-sm
                    mb-2
                  "
                >
                  {campaign?.campaign_type}
                </div>

                <div
                  className="
                    text-blue-400
                    text-xs
                    uppercase
                    tracking-[0.2em]
                    mb-2
                  "
                >
                  {item.platform}
                </div>

                <div
                  className="
                    text-green-400
                    text-xs
                  "
                >
                  {item.status}
                </div>

                <div
                  className="
                    text-white/40
                    text-xs
                    mt-2
                  "
                >
                  Scheduled:
                  {" "}
                  {new Date(
                    item.scheduled_for
                  ).toLocaleString()}
                </div>

              </div>

            );

          }
        )}

      </div>

    </div>

  );

}