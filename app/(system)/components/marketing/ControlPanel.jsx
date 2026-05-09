"use client";

export default function ControlPanel({
  poster,
}) {

  function uploadImage(e) {

    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {

      poster.setSelectedImage(
        reader.result
      );
    };

    reader.readAsDataURL(file);
  }

  return (

    <div className="space-y-5">

      <input
        type="file"
        accept="image/*"
        onChange={uploadImage}
      />

<select
  value={poster.layout}
  onChange={(e) =>
    poster.setLayout(
      e.target.value
    )
  }
  className="
    w-full
    bg-black
    border
    border-white/20
    rounded-xl
    p-4
  "
>

  <option value="Classic">
    Classic
  </option>

  <option value="Centered">
    Centered
  </option>

  <option value="Minimal">
    Minimal
  </option>

</select>
<select
  value={poster.mood}
  onChange={(e) =>
    poster.setMood(
      e.target.value
    )
  }
  className="
    w-full
    bg-black
    border
    border-white/20
    rounded-xl
    p-4
  "
>

  <option>
    Luxury Nightlife
  </option>

  <option>
    Elegant Dinner
  </option>

  <option>
    Party Energy
  </option>

  <option>
    Romantic Lounge
  </option>

</select>

<select
  value={poster.lighting}
  onChange={(e) =>
    poster.setLighting(
      e.target.value
    )
  }
  className="
    w-full
    bg-black
    border
    border-white/20
    rounded-xl
    p-4
  "
>

  <option>
    Cinematic Warm
  </option>

  <option>
    Neon Nightclub
  </option>

  <option>
    Moody Dark
  </option>

  <option>
    Golden Luxury
  </option>

</select>

      <input
        value={poster.campaignTitle}
        onChange={(e) =>
          poster.setCampaignTitle(
            e.target.value
          )
        }
        placeholder="Campaign Title"
        className="
          w-full
          bg-black
          border
          border-white/20
          rounded-xl
          p-4
        "
      />

      <input
        value={poster.campaignSubtitle}
        onChange={(e) =>
          poster.setCampaignSubtitle(
            e.target.value
          )
        }
        placeholder="Subtitle"
        className="
          w-full
          bg-black
          border
          border-white/20
          rounded-xl
          p-4
        "
      />

    </div>

  );
}