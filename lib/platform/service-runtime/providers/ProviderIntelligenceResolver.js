function capabilityPriority(capability){

  if (
    capability.includes("image")
  ){
    return {
      quality:0.5,
      speed:0.2,
      cost:0.3,
    };
  }


  if (
    capability.includes("video")
  ){
    return {
      quality:0.6,
      speed:0.2,
      cost:0.2,
    };
  }


  if (
    capability.includes("ocr") ||
    capability.includes("document")
  ){
    return {
      quality:0.6,
      speed:0.3,
      cost:0.1,
    };
  }


  return {
    quality:0.4,
    speed:0.3,
    cost:0.3,
  };

}



function providerScore(candidate){

  const weights =
    capabilityPriority(
      candidate.capability
    );


  const quality =
    Number(
      candidate.quality_score ??
      80
    );


  const speed =
    Number(
      candidate.speed_score ??
      80
    );


  const cost =
    Number(
      candidate.cost_score ??
      80
    );


  return (

    quality *
      weights.quality

    +

    speed *
      weights.speed

    +

    cost *
      weights.cost

  );

}



export function selectBestProvider(
  candidates = []
){

  return (
    candidates
      .map(candidate => ({
        ...candidate,

        intelligence_score:
          providerScore(candidate),

      }))
      .sort(
        (a,b)=>
          b.intelligence_score -
          a.intelligence_score
      )[0]
    ||
    null
  );

}
