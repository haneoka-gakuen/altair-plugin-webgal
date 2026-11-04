import type { JsonObject } from "@haneoka/altair/model";

export const WEBGAL_ANIMATION_PRESETS: Readonly<Record<string, readonly JsonObject[] | JsonObject>> = Object.freeze({
  "enter-from-left": [
    {
      alpha: 0,
      scale: {
        x: 1,
        y: 1,
      },
      position: {
        x: -50,
        y: 0,
      },
      rotation: 0,
      blur: 5,
      duration: 0,
    },
    {
      alpha: 1,
      scale: {
        x: 1,
        y: 1,
      },
      position: {
        x: 0,
        y: 0,
      },
      rotation: 0,
      blur: 0,
      duration: 500,
    },
  ],
  "enter-from-bottom": [
    {
      alpha: 0,
      position: {
        x: 0,
        y: 50,
      },
      blur: 5,
      duration: 0,
    },
    {
      alpha: 1,
      position: {
        x: 0,
        y: 0,
      },
      blur: 0,
      duration: 500,
    },
  ],
  "enter-from-right": [
    {
      alpha: 0,
      position: {
        x: 50,
        y: 0,
      },
      blur: 5,
      duration: 0,
    },
    {
      alpha: 1,
      position: {
        x: 0,
        y: 0,
      },
      blur: 0,
      duration: 500,
    },
  ],
  shake: [
    {
      position: {
        x: 0,
        y: 0,
      },
      duration: 0,
    },
    {
      position: {
        x: -100,
        y: 0,
      },
      duration: 250,
    },
    {
      position: {
        x: 100,
        y: 0,
      },
      duration: 500,
    },
    {
      position: {
        x: 0,
        y: 0,
      },
      duration: 250,
    },
  ],
  "move-front-and-back": [
    {
      scale: {
        x: 1,
        y: 1,
      },
      duration: 0,
    },
    {
      scale: {
        x: 1.15,
        y: 1.15,
      },
      duration: 500,
    },
    {
      scale: {
        x: 1,
        y: 1,
      },
      duration: 500,
    },
  ],
  enter: [
    {
      alpha: 0,
      duration: 0,
    },
    {
      alpha: 1,
      duration: 300,
    },
  ],
  exit: [
    {
      alpha: 1,
      duration: 0,
    },
    {
      alpha: 0,
      duration: 300,
    },
  ],
  blur: [
    {
      blur: 0,
      duration: 0,
    },
    {
      blur: 5,
      duration: 300,
    },
  ],
  oldfilm: [
    {
      oldFilm: 1,
      duration: 0,
    },
  ],
  dotfilm: [
    {
      dotFilm: 1,
      duration: 0,
    },
  ],
  reflectionfilm: [
    {
      reflectionFilm: 1,
      duration: 0,
    },
  ],
  glitchfilm: [
    {
      glitchFilm: 1,
      duration: 0,
    },
  ],
  rgbfilm: [
    {
      rgbFilm: 1,
      duration: 0,
    },
  ],
  godrayfilm: [
    {
      godrayFilm: 1,
      duration: 0,
    },
  ],
  removefilm: [
    {
      oldFilm: 0,
      dotFilm: 0,
      reflectionFilm: 0,
      glitchFilm: 0,
      rgbFilm: 0,
      godrayFilm: 0,
      duration: 0,
    },
  ],
  shockwavein: [
    {
      shockwaveFilter: 0,
      alpha: 1,
      radiusAlphaFilter: 0,
      duration: 0,
    },
    {
      shockwaveFilter: 3.05,
      alpha: 1,
      radiusAlphaFilter: 1.05,
      duration: 2000,
    },
  ],
  shockwaveout: [
    {
      shockwaveFilter: 0,
      alpha: 1,
      duration: 0,
    },
    {
      shockwaveFilter: 3,
      alpha: 1,
      duration: 2000,
    },
  ],
  "blur-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 300,
      "blur": 5
    }
  ]
},

  "dotfilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "dotFilm": 1
    }
  ]
},

  "enter-from-bottom-v2": {
  "version": 2,
  "relativeCalc": {
    "alpha": "multiplyWithZeroFallback"
  },
  "keyframes": [
    {
      "time": 0,
      "alpha": 0,
      "position": {
        "y": 50
      },
      "blur": 5
    },
    {
      "time": 500,
      "alpha": 1,
      "position": {
        "y": 0
      },
      "blur": 0
    }
  ]
},

  "enter-from-left-v2": {
  "version": 2,
  "relativeCalc": {
    "alpha": "multiplyWithZeroFallback"
  },
  "keyframes": [
    {
      "time": 0,
      "alpha": 0,
      "position": {
        "x": -50
      },
      "blur": 5
    },
    {
      "time": 500,
      "alpha": 1,
      "position": {
        "x": 0
      },
      "blur": 0
    }
  ]
},

  "enter-from-right-v2": {
  "version": 2,
  "relativeCalc": {
    "alpha": "multiplyWithZeroFallback"
  },
  "keyframes": [
    {
      "time": 0,
      "alpha": 0,
      "position": {
        "x": 50
      },
      "blur": 5
    },
    {
      "time": 500,
      "alpha": 1,
      "position": {
        "x": 0
      },
      "blur": 0
    }
  ]
},

  "enter-v2": {
  "version": 2,
  "relativeCalc": {
    "alpha": "multiplyWithZeroFallback"
  },
  "keyframes": [
    {
      "time": 0,
      "alpha": 0
    },
    {
      "time": 300,
      "alpha": 1
    }
  ]
},

  "exit-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 300,
      "alpha": 0
    }
  ]
},

  "glitchfilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "glitchFilm": 1
    }
  ]
},

  "godrayfilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "godrayFilm": 1
    }
  ]
},

  "move-front-and-back-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 500,
      "scale": {
        "x": 1.15,
        "y": 1.15
      }
    },
    {
      "time": 1000,
      "scale": {
        "x": 1,
        "y": 1
      }
    }
  ]
},

  "oldfilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "oldFilm": 1
    }
  ]
},

  "reflectionfilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "reflectionFilm": 1
    }
  ]
},

  "removefilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "oldFilm": 0,
      "dotFilm": 0,
      "reflectionFilm": 0,
      "glitchFilm": 0,
      "rgbFilm": 0,
      "godrayFilm": 0
    }
  ]
},

  "rgbfilm-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "rgbFilm": 1
    }
  ]
},

  "shake-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 250,
      "position": {
        "x": -100
      },
      "ease": "easeOut"
    },
    {
      "time": 750,
      "position": {
        "x": 100
      },
      "ease": "easeInOut"
    },
    {
      "time": 1000,
      "position": {
        "x": 0
      },
      "ease": "easeIn"
    }
  ]
},

  "shockwavein-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "shockwaveFilter": 0,
      "radiusAlphaFilter": 0
    },
    {
      "time": 2000,
      "shockwaveFilter": 3.05,
      "radiusAlphaFilter": 1.05
    }
  ]
},

  "shockwaveout-v2": {
  "version": 2,
  "keyframes": [
    {
      "time": 0,
      "shockwaveFilter": 0
    },
    {
      "time": 2000,
      "shockwaveFilter": 3
    }
  ]
}
});
