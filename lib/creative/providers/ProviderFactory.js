import {
OpenAIProvider,
} from "./adapters/OpenAIProvider";

import {
GoogleVeoProvider,
} from "./adapters/GoogleVeoProvider";

export function getCreativeProvider(id){

switch(id){

case "openai":
return new OpenAIProvider();

case "google_veo":
return new GoogleVeoProvider();

default:
throw new Error(
`Unknown provider: ${id}`
);

}

}
