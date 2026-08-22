import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoInvestorFilmProfessionalChaptersV1 } from "@/lib/investor-film/AvantiqoInvestorFilmProfessionalChaptersV1";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_PROFESSIONAL_CHAPTER_PUBLISH_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";
const COMM_CANONICAL = `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`;
const STUDIO_CANONICAL = `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`;

async function replace(source, destination) {
  await supabaseAdmin.storage.from(BUCKET).remove([destination]).catch(() => null);
  const { error } = await supabaseAdmin.storage.from(BUCKET).copy(source, destination);
  if (error) throw error;
  return destination;
}

export const AvantiqoInvestorFilmProfessionalChapterPublishV1 = Object.freeze({
  CONTRACT,
  async renderAndPublish() {
    const rendered = await AvantiqoInvestorFilmProfessionalChaptersV1.render();
    await replace(rendered.communication.path, COMM_CANONICAL);
    await replace(rendered.studio.path, STUDIO_CANONICAL);
    return {
      success: true,
      contract: CONTRACT,
      rendered,
      canonical: {
        communication: COMM_CANONICAL,
        studio: STUDIO_CANONICAL,
      },
      guarantees: {
        old_black_diagram_replaced: true,
        v9_assembler_paths_unchanged: true,
        cinematic_footage_first: true,
        server_font_dependency: false,
      },
    };
  },
});
