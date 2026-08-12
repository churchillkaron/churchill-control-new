import {
  OpenAIProvider as BaseOpenAIProvider,
} from "./OpenAIProvider";

import {
  executeOpenAITextToSpeech,
} from "./OpenAITextToSpeechRuntime";

const PATCH_KEY = Symbol.for("avantiqo.openai.text-to-speech.registered");

if (!BaseOpenAIProvider[PATCH_KEY]) {
  const executeBase = BaseOpenAIProvider.execute.bind(BaseOpenAIProvider);

  BaseOpenAIProvider.execute = async function execute(input = {}) {
    if (input.capability === "ai.text.to.speech") {
      return executeOpenAITextToSpeech(input);
    }

    return executeBase(input);
  };

  Object.defineProperty(BaseOpenAIProvider, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
