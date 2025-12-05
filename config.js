export const Config = {
  jawChannel: 2,
  browLeftChannel: 6,
  browRightChannel: 3,
  eyelidBackChannel: 4,

  // tiltLeftChannel: 8,
  // tiltRightChannel: 9,
  // TILT DISABLED

  jawMin: 20,
  jawMax: 90,
  jawFps: 12,
  jawSmoothing: 0.35,
  jawGain: 5.0,
  jawSilenceFloor: 0.02,
  jawSilenceHoldMs: 80,

  emotions: {
    angry: {
      jaw: 90,
      eyelidBack: 35,
      browRight: 145,
      browLeft: 30,
      // tiltLeft: 90,
      // tiltRight: 90,
    },
    neutral: {
      jaw: 40,
      eyelidBack: 40,
      browRight: 80,
      browLeft: 80,
      // tiltLeft: 90,
      // tiltRight: 90,
    },
    shocked: {
      jaw: 90,
      eyelidBack: 90,
      browRight: 30,
      browLeft: 145,
      // tiltLeft: 90,
      // tiltRight: 90,
    },
    smolder: {
      jaw: 50,
      eyelidBack: 60,
      browRight: 100,
      browLeft: 145,
      // tiltLeft: 70,
      // tiltRight: 70,
    },
    happy: {
      jaw: 35,
      eyelidBack: 70,
      browRight: 30,
      browLeft: 145,
      // tiltLeft: 110,
      // tiltRight: 110,
    },
  },
};
