export function resolveCreativeService(task = {}) {


  if (task.service_id) {

    return task.service_id;

  }



  switch (task.type) {


    case "GENERATE_IMAGE":

      return "ai.image.generate";



    case "GENERATE_VIDEO":

    case "IMAGE_TO_VIDEO":

    case "RENDER_DRAFT":

    case "RENDER_PRODUCTION":

      return "ai.video.generate";



    case "GENERATE_VOICE":

      return "ai.voice.generate";



    case "GENERATE_MUSIC":

      return "ai.music.generate";



    case "LIP_SYNC":

      return "ai.video.lipsync";



    case "UPSCALE":

      return "ai.image.upscale";



    case "SUBTITLE":

      return "ai.speech.to.text";



    case "QUALITY_REVIEW":

      return "ai.reasoning.execute";



    default:

      return "ai.image.generate";


  }


}
