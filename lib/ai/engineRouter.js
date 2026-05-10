export default function engineRouter(
  engine
) {

  switch (engine) {

    case "full-ai":

      return {
        provider:
          "openai",
      };

    case "enhance":

      return {
        provider:
          "flux",
      };

    case "composite":

      return {
        provider:
          "sdxl",
      };

    case "video":

      return {
        provider:
          "runway",
      };

    default:

      return {
        provider:
          "openai",
      };

  }

}