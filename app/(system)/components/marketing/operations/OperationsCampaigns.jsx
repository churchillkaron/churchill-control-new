
export default function OperationsCampaigns({

  campaigns,

}) {

  return (

    <div>

      <div className="text-lg font-semibold mb-4">
        Recent Campaigns
      </div>

      <div className="space-y-3">

        {campaigns
          .slice(0, 10)
          .map((campaign) => (

            <div
              key={campaign.id}
              className="
                bg-white/5
                border
                border-white/10
                rounded-2xl
                p-4
                flex
                items-center
                justify-between
              "
            >

              <div>

                <div className="font-semibold">
                  {campaign.title}
                </div>

                <div className="text-white/50 text-sm mt-1">
                  {campaign.campaign_type}
                </div>

              </div>

              <div className="text-right">

                <div className="text-orange-400 text-sm">
                  {campaign.status}
                </div>

                <div className="text-white/40 text-xs mt-1">
                  Score: {campaign.performance_score || 0}
                </div>

              </div>

            </div>

        ))}

      </div>

    </div>

  );

}