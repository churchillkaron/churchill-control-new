"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Image from "next/image";

const PLATFORM_OPTIONS = [
  {
    id: "google",
    name: "Google",
    sub: "Business Profile",
    icon: "/icons/google.png",
  },
  {
    id: "facebook",
    name: "Facebook",
    sub: "Page",
    icon: "/icons/facebook.png",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    sub: "Business",
    icon: "/icons/whatsapp.png",
  },
];

export default function SocialPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState("facebook");
const [selectedTab, setSelectedTab] =
  useState("all");
  useEffect(() => {

  async function loadCampaigns() {

    try {

      const response =
        await fetch("/api/marketing");

      const data =
        await response.json();

      console.log(
        "CAMPAIGNS:",
        data
      );

      if (!Array.isArray(data)) {

        setCampaigns([]);

        return;
      }

      const normalized =
  data.map((campaign) => ({

    id:
      campaign.id,

    title:
      campaign.title ||
      campaign.campaign_type ||
      "Untitled Campaign",

    desc:
      campaign.subtitle ||
      campaign.caption ||
      "",

    image:
      campaign.image_url,

    status:
      campaign.status ||
      "draft",

    type:
      campaign.campaign_type ||
      "campaign",

    platforms: {
      google: false,
      facebook: true,
      whatsapp: false,
    },

  }));

      setCampaigns(normalized);

    } catch (error) {

      console.error(
        "LOAD CAMPAIGNS ERROR:",
        error
      );

    }

  }

  loadCampaigns();

}, []);

  const saveCampaigns = (next) => {
    setCampaigns(next);
    localStorage.setItem("campaigns", JSON.stringify(next));
  };

  const togglePlatform = (id, platform) => {
    const next = campaigns.map((c) =>
      c.id === id
        ? {
            ...c,
            platforms: {
              ...c.platforms,
              [platform]: !c.platforms?.[platform],
            },
          }
        : c
    );

    saveCampaigns(next);
  };

  const postNow = async (campaign) => {

  try {

    const next =
      campaigns.map((c) =>
        c.id === campaign.id
          ? {
              ...c,
              status: "queued",
            }
          : c
      );

    saveCampaigns(next);

    const response =
      await fetch(
        "/api/marketing/publish",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            campaignId:
              campaign.id,

            platforms:
              campaign.platforms,
          }),
        }
      );

    const data =
      await response.json();

    console.log(
      "PUBLISH RESULT:",
      data
    );

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Publish failed"
      );

    }

    alert(
      "Campaign queued successfully"
    );

  } catch (error) {

    console.error(
      "POST ERROR:",
      error
    );

    alert(
      error.message
    );

  }

};
  

  const removeCampaign = (id) => {
    const next = campaigns.filter((c) => c.id !== id);
    saveCampaigns(next);
  };
const filteredCampaigns =
  campaigns.filter((campaign) => {

    if (selectedTab === "all") {
      return true;
    }

    return (
      campaign.status ===
      selectedTab
    );

  });
  return (
    <div className="min-h-screen text-white relative">
      <div className="absolute inset-0">
        <img
          src="/bg-hero-control.jpg"
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-black/80" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-light mb-2">Social Media</h1>
            <p className="text-white/50">
              Manage your campaigns and publish across platforms.
            </p>
          </div>

          <button className="border border-[#ff7a00] text-[#ff7a00] px-5 py-3 rounded-xl hover:bg-[#ff7a00] hover:text-black transition">
            + NEW CAMPAIGN
          </button>
        </div>

        <div className="mb-10">
          <p className="text-white/40 text-sm mb-4">CHOOSE PLATFORM</p>

          <div className="grid md:grid-cols-3 gap-6">
            {PLATFORM_OPTIONS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`flex items-center gap-4 p-5 rounded-2xl border bg-black/50 transition ${
                  selectedPlatform === platform.id
                    ? "border-[#ff7a00] shadow-[0_0_20px_rgba(255,122,0,0.25)]"
                    : "border-white/10 hover:border-[#ff7a00]/40"
                }`}
              >
                <Image
                  src={platform.icon}
                  alt={platform.name}
                  width={56}
                  height={56}
                  className="rounded-full"
                />

                <div className="text-left">
                  <p className="text-xl">{platform.name}</p>
                  <p className="text-sm text-white/40">{platform.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-2xl p-6">
          <div className="flex gap-8 mb-8 text-sm">

  {[
    "all",
    "draft",
    "ready",
    "scheduled",
    "posted",
  ].map((tab) => (

    <button
      key={tab}
      onClick={() =>
        setSelectedTab(tab)
      }
      className={
        selectedTab === tab
          ? "text-[#ff7a00] border-b border-[#ff7a00] pb-2 capitalize"
          : "text-white/70 capitalize"
      }
    >
      {tab === "all"
        ? "All Campaigns"
        : tab}
    </button>

  ))}

</div>


          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
  {filteredCampaigns.map((c) => (
              <div
                key={c.id}
                className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden"
              >
                <img
                  src={c.image}
                  alt={c.title}
                  className="w-full h-56 object-cover"
                />

                <div className="p-4">
                  <p className="text-xs text-[#ff7a00] mb-2 uppercase">
                    {c.type}
                  </p>

                  <h3 className="text-xl mb-2">{c.title}</h3>
                  <p className="text-sm text-white/60 mb-4">{c.desc}</p>

                  <div className="flex items-center gap-4 mb-4">
                    {PLATFORM_OPTIONS.map((platform) => (
                      <button
                        key={platform.id}
                        onClick={() => togglePlatform(c.id, platform.id)}
                        className="flex items-center gap-2"
                      >
                        <Image
                          src={platform.icon}
                          alt={platform.name}
                          width={24}
                          height={24}
                          className={
                            c.platforms?.[platform.id]
                              ? "opacity-100"
                              : "opacity-30"
                          }
                        />
                        <span
                          className={`w-3 h-3 rounded-full border ${
                            c.platforms?.[platform.id]
                              ? "bg-[#ff7a00] border-[#ff7a00]"
                              : "border-white/40"
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center mb-4 text-sm">
                    <span
                      className={
                        c.status === "ready"
                          ? "text-green-400"
                          : c.status === "scheduled"
                          ? "text-blue-400"
                          : c.status === "posted"
                          ? "text-green-500"
                          : c.status === "posting"
                          ? "text-orange-400"
                          : "text-yellow-400"
                      }
                    >
                      ● {c.status}
                    </span>

                    <span className="text-white/40">Today • 18:00</span>
                  </div>

                  <div className="flex gap-3">
                    <button className="flex-1 border border-white/10 rounded-lg py-2 text-sm hover:border-white/30">
                      EDIT
                    </button>

                    <button
                      onClick={() => postNow(c)}
                      className="flex-1 border border-[#ff7a00] text-[#ff7a00] rounded-lg py-2 text-sm hover:bg-[#ff7a00] hover:text-black transition"
                    >
                      POST
                    </button>

                    <button
                      onClick={() => removeCampaign(c.id)}
                      className="px-3 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10"
                    >
                      X
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}