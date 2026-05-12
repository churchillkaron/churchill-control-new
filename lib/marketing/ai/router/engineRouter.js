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

        assets,

        poster,

      });

    // =====================================
    // ENHANCE
    // =====================================

    case "enhance":

      return await runFluxEnhanceEngine({

        prompt,

        assets,

        poster,

      });

    // =====================================
    // COMPOSITE
    // =====================================

    case "composite":

      return await runCompositeEngine({

        prompt,

        assets,

        poster,

      });

    // =====================================
    // VIDEO
    // =====================================

    case "video":

      return await runVideoEngine({

        prompt,

        assets,

        poster,

      });

    // =====================================
    // DEFAULT
    // =====================================

    default:

      return await runFullAIEngine({

        prompt,

        assets,

        poster,

      });

  }

}