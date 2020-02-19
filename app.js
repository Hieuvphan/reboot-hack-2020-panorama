/**
 * If the argument `condition` is falsy then an exception (error?) is raised
 * with message `message`.
 * 
 * @param {any} condition 
 * @param {string=} message 
 */
function assert(condition, message = "Assertion failed!") {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Returns `max(minValue, min(maxValue, value))`.
 * 
 * @param {number} value 
 * @param {number} minValue 
 * @param {number} maxValue 
 */
function clamp(value, minValue, maxValue) {
  assert(minValue <= maxValue);
  if (value < minValue) {
    return minValue;
  } else if (value > maxValue) {
    return maxValue;
  } else {
    return value;
  }
}

/**
 * Returns the mouse position with in HTML element `el`.
 * 
 * @param {HTMLElement} el 
 * @param {MouseEvent} evt 
 */
function getMousePosition(el, evt) {
  const rect = el.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

/**
 * Fetches an image (HTML image element) from the URL `url`.
 * 
 * @param {string} url 
 * @returns {Promise<HTMLImageElement>}
 */
function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (ev) => {
      resolve(image);
    };
    image.onerror = (ev) => {
      console.error(`Error loading image: ${url}`);
      reject();
    };

    image.src = url;
  });
}


/** Resolves once the document (DOM and other assets) have been loaded. */
const promiseWindowLoaded = new Promise((resolve) => {
  const listener = () => {
    window.removeEventListener("load", listener);
    resolve();
  };
  window.addEventListener("load", listener);
});



/** @type {HTMLCanvasElement} */
let canvas;


// NOTE: when we draw images we can use HTML image elements AND HTML canvas
// elements.

/** @type {HTMLImageElement} */
let backgroundImage;

/** @type {HTMLCanvasElement} */
let backgroundCanvas = document.createElement("canvas");

/** @type {HTMLImageElement} */
let foregroundImage;

/** @type {HTMLCanvasElement} */
let foregroundCanvas = document.createElement("canvas");

/** @type {HTMLImageElement} */
let borderImage;

/** @type {HTMLCanvasElement} */
let borderCanvas = document.createElement("canvas");


/**
 * What to scale the image by so its height fits the canvas's height.
 * 
 * * If the image's height is larger than that of the canvas, then the scale 
 *   will be less than 1.
 * * If the image's height is exactly as that of the canvas, then the scale will
 *   be exactly 1.
 * * If the image's height is smaller than the canvas, then the scale will be
 *   greater than 1.
 */
let imageScale = 1;


/** Set to `true` when animation and rendering can begin. */
let ready = false;

/** Whether is rendering or not. */
let animating = false;



let imageOffsetX = 0;

/** @type {number} ID of next animation frame (used when pausing animation). */
let animationRequestID;


/** Mouse coordinates. */
const mouse = {
  x: 0,
  y: 0
};

/** Previous time of animation frame.  Default 0. */
let previousTime = 0;


/** Panning speed (left / right) in pixels per second. */
const panningSpeed = 800;


//////////////
// Keyboard //
//////////////

const KEY_ARROW_LEFT = 37;
const KEY_ARROW_UP = 38;
const KEY_ARROW_RIGHT = 39;
const KEY_ARROW_DOWN = 40;

const KEY_A = 65;
const KEY_W = 87;
const KEY_D = 68;
const KEY_S = 83;

const g_keys = [];

window.onkeydown = (ev) => { g_keys[ev.keyCode] = true; };
window.onkeyup = (ev) => { g_keys[ev.keyCode] = false; };

/** 
 * Determine if key with key code `keyCode` is pressed.
 * 
 * @param {number} keyCode 
 */
function isKeyDown(keyCode) {
  return !!g_keys[keyCode];
}

/**
 * Determine if any key with any of the key codes in array `keyCodes` is
 * pressed.
 *
 * @param {number[]} keyCodes 
 */
function isOneKeyDown(keyCodes) {
  for (let i = 0; i < keyCodes.length; ++i) {
    const keyCode = keyCodes[i];
    if (isKeyDown(keyCode)) return true;
  }
  return false;
}

// Resize canvas if window changes.
window.onresize = () => {
  resizeCanvas();
};

/**
 * 
 * @param {HTMLImageElement | HTMLCanvasElement} source
 * @param {HTMLCanvasElement} target
 * @param {number} scale
 */
function resizeImage(source, target, scale) {

  target.width = Math.round(scale * source.width);
  target.height = Math.round(scale * source.height);

  const ctx = target.getContext("2d");

  if (ctx.imageSmoothingQuality) {
    ctx.imageSmoothingQuality = "high";
  }

  {
    const image = source;

    const sx = 0;
    const sy = 0;
    const sWidth = source.width;
    const sHeight = source.height;

    const dx = 0;
    const dy = 0;
    const dWidth = target.width;
    const dHeight = target.height;

    ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
  }
}

/**
 * Resizes all the images to fit the canvas.
 */
function resizeImages() {
  resizeImage(backgroundImage, backgroundCanvas, imageScale);
  resizeImage(foregroundImage, foregroundCanvas, imageScale);
  resizeImage(borderImage, borderCanvas, imageScale * 1.8);
}

/**
 * Call this function to resize canvas.
 */
function resizeCanvas() {
  if (!ready) return;

  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;

  // Determine what we should scale images by.
  imageScale = canvas.height / foregroundImage.height;

  resizeImages();
}

/**
 * Stops animating or the main loop.
 */
function stopAnimation() {
  animating = false;
  window.cancelAnimationFrame(animationRequestID);
}

/**
 * Starts animating or the main loop.
 */
function startAnimation() {
  if (animating) return;
  animating = true;
  previousTime = 0;
  animate(previousTime);
}

/**
 * 
 * @param {number} currentTime Current time (me thinks) in milliseconds
 */
function animate(currentTime) {
  if (!animating) return;

  // Determine how much time has passed since last time.  Should not be more
  // than 1000 / 60 = 16.667 milliseconds (i.e. 60 FPS).
  const dt = Math.max(currentTime - previousTime, 1000 / 60);

  previousTime = currentTime;

  // Main loop iteration
  step(dt);

  // If we stop animating then we must cancel the next animation frame with
  // this ID.
  animationRequestID = window.requestAnimationFrame(animate);
}


/**
 * Main loop iteration
 * 
 * @param {number} dt Time that has passed since last frame (in milliseconds).
 */
function step(dt) {
  update(dt);
  render(dt);
}


/**
 * Update phase in main loop iteration.
 * 
 * @param {number} dt Time that has passed since last frame (in milliseconds).
 */
function update(dt) {
  // Move offset of image (proportional to dt)
  {
    const imageMovement = panningSpeed * dt / 1000;

    const canvasWidth = canvas.width;
    const imageWidth = foregroundCanvas.width;
    assert(canvasWidth < imageWidth);
    const limit = imageWidth - canvasWidth;

    if (isOneKeyDown([KEY_ARROW_LEFT, KEY_A])) {
      imageOffsetX = clamp(imageOffsetX - imageMovement, 0, limit);
    } else if (isOneKeyDown([KEY_ARROW_RIGHT, KEY_D])) {
      imageOffsetX = clamp(imageOffsetX + imageMovement, 0, limit);
    }
  }
}


/**
 * Render next frame and display.
 * 
 * @param {number} dt Time that has passed since last frame (in milliseconds).
 */
function render(dt) {
  if (!ready) return;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // TODO: crap is resolution dependent :'(
  const borderWidth = borderCanvas.width;
  const borderHeight = borderCanvas.height;

  // Draw foreground image
  {
    const image = foregroundCanvas;

    const dx = -imageOffsetX;
    const dy = 0;

    ctx.drawImage(image, dx, dy);
  }

  // Draw portion of background image
  {
    const image = backgroundCanvas;

    const backgroundWidth = borderWidth * 0.937;
    const backgroundHeight = borderHeight * 0.937;

    const sx = mouse.x + imageOffsetX - backgroundWidth / 2;
    const sy = mouse.y - backgroundHeight / 2;
    const sWidth = backgroundWidth;
    const sHeight = backgroundHeight;

    const dx = mouse.x - backgroundWidth / 2;
    const dy = mouse.y - backgroundHeight / 2;
    const dWidth = backgroundWidth;
    const dHeight = backgroundHeight;

    ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
  }

  // Draw border image
  {
    const image = borderCanvas;

    const sx = mouse.x - borderWidth / 2;
    const sy = mouse.y - borderHeight / 2;

    ctx.drawImage(image, sx, sy);
  }

  // DEBUG: Framerate
  if (false) {
    ctx.fillStyle = "green";
    ctx.fillText(`FPS: ${1000 / dt}`, 10, 10);
  }
}

async function main() {
  // Wait for all resources to be fetched.
  [, foregroundImage, backgroundImage, borderImage] = await Promise.all([
    promiseWindowLoaded,
    fetchImage("./HappyPanorama.jpg"),
    fetchImage("./SadPanorama.jpg"),

    fetchImage("./phone-landscape.png")
  ]);

  assert(typeof foregroundImage !== "undefined");
  assert(typeof backgroundImage !== "undefined");
  assert(typeof borderImage !== "undefined");

  assert(foregroundImage.width === backgroundImage.width);
  assert(foregroundImage.height === backgroundImage.height);

  canvas = document.querySelector("#canvas");

  ready = true;

  resizeCanvas();

  // Add mouse listener to canvas.
  canvas.addEventListener("mousemove", (evt) => {
    const { x, y } = getMousePosition(canvas, evt);
    mouse.x = x;
    mouse.y = y;
  });

  startAnimation();
}

main();
