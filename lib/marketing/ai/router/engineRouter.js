import { runFluxEnhanceEngine }
from "@/lib/marketing/ai/engines/runFluxEnhanceEngine";

import { runFullAIEngine }
from "@/lib/marketing/ai/engines/runFullAIEngine";

import { runCompositeEngine }
from "@/lib/marketing/ai/engines/runCompositeEngine";

import { runVideoEngine }
from "@/lib/marketing/ai/engines/runVideoEngine";

export default async function
engineRouter({

  engine,

  prompt,

  businessProfile,

  assets,

  poster,

}) {

  switch (engine) {

    // =====================================
    // FULL AI
    // =====================================

    case "full-ai":

      return await runFullAIEngine({

        prompt,

        businessProfile,

        assets,

        poster,

      });

    // =====================================
    // ENHANCE
    // =====================================

    case "enhance":

      return await runFluxEnhanceEngine({

        prompt,

        businessProfile,

        assets,

        poster,

      });

    // =====================================
    // COMPOSITE
    // =====================================

    case "composite":

      return await runCompositeEngine({

        prompt,

        businessProfile,

        assets,

        poster,

      });

    // =====================================
    // VIDEO
    // =====================================

    case "video":

      return await runVideoEngine({

        prompt,

        businessProfile,

        assets,

        poster,

      });

    // =====================================
    // DEFAULT
    // =====================================

    default:

      return await runFullAIEngine({

        prompt,

        businessProfile,

        assets,

        poster,

      });

  }

}