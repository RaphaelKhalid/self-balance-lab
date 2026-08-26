// Three.js scene setup: renderer, camera, lights, mounting deck, slots.
//
// ART DIRECTION — "Precision Instrument Studio":
// A cool, neutral, product-photography look inspired by modern CAD viewports and
// scientific-instrument industrial design. A seamless graduated backdrop (no hard
// horizon), a designed technical floor with a fine energy grid + a soft pool of
// light under the bench, calibrated three-point studio lighting (cool key, cooler
// fill, blue rim), ACES tone mapping, and a restrained bloom so emissive accents
// (cyan status glow, part LEDs) read as tastefully lit — never blown out. The
// intent: screenshots that look like a shipped instrument, not a WebGL demo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { isLowQuality } from './app/quality.js';

// Vertical lift applied to the assembly rig (chassis deck, parts, slot ghosts)
// so the motors' wheels rest on the workbench floor instead of clipping through
// it. Shared with js/app/assembly.js so parts and deck lift together.
export const ASSEMBLY_LIFT = 2.1;

// Signature palette — cool neutral instrument studio with a cyan accent.
const COL = {
  bgTop:   0x0a0e15,   // deep cool charcoal (backdrop zenith)
  bgHoriz: 0x161d29,   // slightly lifted horizon band
  bgFloor: 0x070a10,   // near-black under the bench
  accent:  0x39d7ff,   // cyan technical accent (grid, trim glow)
  keyCol:  0xf2f6ff,   // neutral-cool key light
  fillCol: 0xaec6ff,   // cool sky-blue fill
  rimCol:  0x5b8cff,   // blue rim/separation light
};

// The light theme is deliberately CREAM, not white, and warm rather than neutral.
// Two reasons. Comfort: pulling blue out of a bright UI is what "night light"
// modes do, and this is a tool people stare at for an hour. Distinctiveness:
// every competitor in browser electronics — Wokwi, Falstad, CircuitJS — is dark
// and techy, which reads "for engineers". Cream reads "for learners", which is
// the audience.
//
// The whole rig moves together, not just the backdrop. A cream sky under a cool
// blue key light looks like a rendering bug, so the key/fill/rim warm up, the
// ambient and hemisphere come UP (high-key lighting has soft, filled shadows),
// and the rim light comes DOWN — dramatic separation is a dark-studio device and
// looks dirty on cream.
const COL_LIGHT = {
  // Sampled from Gandolfi's "Zeus with Hera Expelling Hephaestus" (public
  // domain) so the 3D and the DOM share one source. The canvas is entirely
  // warm — red-minus-blue +26 to +108 — which is what makes it a principled
  // palette rather than a decorative reference.
  bgTop:   0xe6d6c2,   // deeper ochre at the zenith, so there is real gradation
  bgHoriz: 0xf2e7dc,   // the parchment the DOM uses for --gray-1
  bgFloor: 0xd6c2ae,   // umber under the bench
  accent:  0xb85c25,   // forge ember
  keyCol:  0xfff2e0,   // warm white key
  fillCol: 0xf7e3cc,   // warm fill
  rimCol:  0xd6b48c,   // soft tan rim, close in value — high-key wants no drama
};

// Per-theme values for everything that is not a plain colour swap.
const THEME = {
  dark: {
    col: COL,
    hemi:    { sky: 0xcfe0ff, ground: 0x0a0e15, intensity: 0.55 },
    ambient: { color: 0xdfe8ff, intensity: 0.08 },
    key: 2.6, fill: 0.55, rim: 1.1,
    pool:    { color: 0xdaeaff, intensity: 55 },
    softbox: 0xdfe8ff,
    floor:   { base: 0x0b0f16, grid: 0x22303f },
    bloom: { hi: 0.42, lo: 0.34 },
    exposure: 1.02,
  },
  light: {
    col: COL_LIGHT,
    hemi:    { sky: 0xfff2dd, ground: 0xd8c9b0, intensity: 0.95 },
    ambient: { color: 0xfff0dc, intensity: 0.34 },
    key: 1.75, fill: 0.85, rim: 0.3,
    pool:    { color: 0xffe6c4, intensity: 26 },
    softbox: 0xfff4e6,
    floor:   { base: 0xefe2d4, grid: 0xd3c1ab },
    // Bloom is the thing that breaks a light theme. Emissive glow needs a dark
    // ground to read as light; on cream it just fogs the image. Almost off.
    bloom: { hi: 0.06, lo: 0.05 },
    exposure: 0.98,
  },
};

export function createScene(canvas) {
  const lowQ = isLowQuality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQ, powerPreference: 'high-performance' });
  // pixel ratio is the biggest GPU lever and also drives the bloom pass's
  // internal resolution — cap it lower on weak devices.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQ ? 1 : 2));
  renderer.shadowMap.enabled = true;
  // soft PCF on capable devices; plain (cheaper) shadows on low tier.
  renderer.shadowMap.type = lowQ ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  // ACES filmic gives the calibrated, slightly desaturated highlight roll-off that
  // reads as "product render". Exposure tuned so metals stay crisp under bloom.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bgHoriz);
  // cool volumetric depth so distant scenery fades into the backdrop seamlessly.
  scene.fog = new THREE.Fog(COL.bgHoriz, 90, 320);

  // ── environment reflections: a soft cool studio gradient ──────────────────
  // A procedural gradient dome (dark cool zenith → lifted horizon → deep floor)
  // gives metals a graduated, believable sheen instead of a flat grey or a
  // blown-out studio softbox. Built in-scene so we own every value; PMREM turns
  // it into a filtered environment map for MeshStandardMaterial reflections.
  const gradShader = {
    uniforms: {
      top:    { value: new THREE.Color(COL.bgTop) },
      horiz:  { value: new THREE.Color(COL.bgHoriz) },
      bottom: { value: new THREE.Color(COL.bgFloor) },
      accent: { value: new THREE.Color(COL.accent) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 horiz; uniform vec3 bottom; uniform vec3 accent;
      void main() {
        float h = vDir.y;                        // -1 (down) .. 1 (up)
        vec3 col = h > 0.0
          ? mix(horiz, top, pow(clamp(h, 0.0, 1.0), 0.8))
          : mix(horiz, bottom, pow(clamp(-h, 0.0, 1.0), 0.5));
        // a faint cool key-glow band just above the horizon for depth
        col += accent * 0.06 * smoothstep(0.35, 0.0, abs(h - 0.12));
        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  const envScene = new THREE.Scene();
  const envDomeMat = new THREE.ShaderMaterial({
    ...cloneShader(gradShader), side: THREE.BackSide, depthWrite: false });
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 24), envDomeMat);
  envScene.add(envDome);
  // a soft overhead softbox so metals get one clean, gentle highlight
  const envBox = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff }));
  envBox.position.set(0, 24, 0);
  envBox.rotation.x = Math.PI / 2;
  envScene.add(envBox);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Remembered so setTheme() can tell "the studio env map I made" from "an HDRI
  // the bench room installed", and only ever replace its own.
  let ownedEnv = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = ownedEnv;

  // 42° rather than a wide 55°: at bench scale a wide lens turns the parts into
  // specks in a room. The narrower lens compresses the scene and reads as a
  // product photograph of the work surface, which is what this is.
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(26, 52, 66);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(4, 3, 2);   // bench surface, not the floor plane
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  // 175 let the camera retreat far enough that the build became a speck on an
  // empty counter — the framing that made a working circuit look like nothing.
  controls.maxDistance = 120;
  // The room is open only towards +z — it has a back wall, two side walls and a
  // ceiling, and no fourth wall. Orbiting past ±85° puts the camera outside that
  // shell, looking at the blank back of the plaster. Clamping the azimuth keeps
  // every reachable angle a view *of the room* rather than of its exterior.
  controls.minAzimuthAngle = -Math.PI * 0.47;
  controls.maxAzimuthAngle = Math.PI * 0.47;

  // Fit the camera to a subject's bounding box. Hand-tuned coordinates frame one
  // specific build; anything else lands off-centre or clipped. This computes the
  // distance the current lens needs to contain the subject and points the orbit
  // target at its centre, so any build — seeded, restored or shared — arrives
  // composed rather than accidentally cropped.
  function frameObject(object, { padding = 1.9, dir = [0.34, 0.66, 0.9] } = {}) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return false;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // half the diagonal, floored so a single small part doesn't jam the lens
    const radius = Math.max(size.length() * 0.5, 7);
    const dist = (radius / Math.sin((camera.fov * Math.PI / 180) / 2)) * padding;
    const v = new THREE.Vector3(...dir).normalize();
    camera.position.copy(center).addScaledVector(v, dist);
    controls.target.copy(center);
    controls.update();
    return true;
  }

  // ── calibrated three-point studio lighting (cool, product-photo) ──────────
  // hemisphere: cool sky above, dark cool bounce below — sets the neutral base
  const studioHemi = new THREE.HemisphereLight(0xcfe0ff, 0x0a0e15, 0.55);
  const studioAmbient = new THREE.AmbientLight(0xdfe8ff, 0.08);
  scene.add(studioHemi);
  scene.add(studioAmbient);
  // key: crisp neutral-cool light from upper front-left, the shadow caster
  const key = new THREE.DirectionalLight(COL.keyCol, 2.6);
  key.position.set(26, 58, 34);
  key.castShadow = true;
  const shMap = lowQ ? 1024 : 2048;
  key.shadow.mapSize.set(shMap, shMap);
  const s = 60;
  key.shadow.camera.left = -s; key.shadow.camera.right = s;
  key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 220;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);
  // fill: dim, cooler, opposite side — opens up the shadows without flattening
  const fill = new THREE.DirectionalLight(COL.fillCol, 0.55);
  fill.position.set(-32, 24, -14);
  scene.add(fill);
  // rim: blue back-light that traces a cool edge on parts, separating them from
  // the backdrop — the classic "expensive product shot" separation.
  const rim = new THREE.DirectionalLight(COL.rimCol, 1.1);
  rim.position.set(-10, 16, -40);
  scene.add(rim);
  // a soft cool pool of light hovering over the bench for local falloff
  const pool = new THREE.PointLight(0xdaeaff, 55, 130, 2.0);
  pool.position.set(0, 26, 6);
  scene.add(pool);

  // ── designed technical floor: energy grid + soft light pool ───────────────
  // A custom ShaderMaterial floor (this is what main.js animates via
  // floorUniforms.uTime). It reads as a precision worktop: a dark cool base, a
  // fine measured grid that fades with distance, brighter major gridlines, a
  // soft radial pool of light centered under the bench, and a slow breathing
  // pulse along the grid so the surface feels alive without being noisy.
  // The floor shader opts into scene fog (fog:true + fog_pars chunks), so it must
  // carry THREE's fog uniforms (fogColor/fogNear/fogFar) or the renderer derefs
  // undefined.value while refreshing them. Merge them alongside our custom set.
  const floorUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime:   { value: 0 },
      uBase:   { value: new THREE.Color(0x0b0f16) },
      uGrid:   { value: new THREE.Color(0x22303f) },
      uAccent: { value: new THREE.Color(COL.accent) },
      uPulse:  { value: lowQ ? 0.0 : 1.0 },   // disable the animated pulse on low tier
    },
  ]);
  const FLOOR_SIZE = 600;
  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    fog: true,
    transparent: false,
    vertexShader: `
      varying vec2 vWorld;
      varying vec3 vViewPos;
      #include <fog_pars_vertex>
      void main() {
        vWorld = position.xy;                    // plane is XY before rotation
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        #ifdef USE_FOG
          vFogDepth = -mv.z;
        #endif
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vWorld;
      uniform float uTime;
      uniform vec3 uBase; uniform vec3 uGrid; uniform vec3 uAccent;
      uniform float uPulse;
      #include <fog_pars_fragment>

      // anti-aliased grid line intensity at spacing sp, line width lw (world units)
      float gridLine(vec2 p, float sp, float lw) {
        vec2 g = abs(fract(p / sp - 0.5) - 0.5) * sp;
        vec2 w = fwidth(p) * lw;
        vec2 l = smoothstep(w, vec2(0.0), g);
        return max(l.x, l.y);
      }

      void main() {
        vec2 p = vWorld;
        float r = length(p);

        // fade the whole pattern out with distance so the floor dissolves into
        // the backdrop (no hard tile edge, no visible far plane)
        float fade = smoothstep(280.0, 40.0, r);

        // fine + major grid
        float minor = gridLine(p, 4.0, 1.0) * 0.35;
        float major = gridLine(p, 20.0, 1.4) * 0.9;

        vec3 col = uBase;
        col = mix(col, uGrid, minor * fade);
        col = mix(col, mix(uGrid, uAccent, 0.35), major * fade);

        // soft central pool of light under the bench
        float pool = smoothstep(70.0, 0.0, r);
        col += uAccent * 0.05 * pool;
        col = mix(col, col * 1.35, pool * 0.6);

        // slow breathing pulse travelling out along the major grid
        float pulse = uPulse * major * fade * (0.5 + 0.5 * sin(uTime * 1.2 - r * 0.05));
        col += uAccent * 0.6 * pulse;

        // gentle vignette toward the far floor
        col *= mix(0.55, 1.0, smoothstep(320.0, 30.0, r));

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);
  // a plain shadow-catcher just above the shader floor so the bench still casts
  // a grounded contact shadow (the shader floor can't receive shadows itself).
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.ShadowMaterial({ opacity: 0.28 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.015;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  // ── mounting deck the robot is built on (anodized-instrument look) ────────
  const chassis = new THREE.Group();
  // dark base plate (gives a crisp shadow line and a slim border)
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.6, 28),
    new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.55, metalness: 0.3 }));
  board.position.y = -0.55;
  board.receiveShadow = true; board.castShadow = true;
  chassis.add(board);
  // brushed anodized-aluminium deck the parts actually sit on (top at y≈0)
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.4, 26),
    new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.34, metalness: 0.9 }));
  deck.position.y = -0.2;
  deck.receiveShadow = true; deck.castShadow = true;
  chassis.add(deck);
  // slim emissive cyan accent trim (a frame) — the signature "powered on" cue.
  // emissive so it catches the bloom pass tastefully.
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x0c1418, roughness: 0.4, metalness: 0.7,
    emissive: new THREE.Color(COL.accent), emissiveIntensity: 0.9,
  });
  for (const [w, d, x, z] of [[16.6, 0.24, 0, 13], [16.6, 0.24, 0, -13], [0.24, 26.6, 8, 0], [0.24, 26.6, -8, 0]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), trimMat);
    bar.position.set(x, 0.02, z);
    chassis.add(bar);
  }
  // machined corner bolts (neutral steel)
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.28, metalness: 0.95 });
  for (const bx of [-7.4, 7.4]) for (const bz of [-12.4, 12.4]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 16), boltMat);
    bolt.position.set(bx, 0.06, bz);
    bolt.castShadow = true;
    chassis.add(bolt);
  }
  chassis.position.y = ASSEMBLY_LIFT;
  scene.add(chassis);

  // ── graduated backdrop dome (the same gradient the env map uses) ──────────
  // No texture, no hard horizon — a seamless cool studio cyclorama. toneMapped
  // so it sits in the same colour space as the lit geometry.
  const skyMat = new THREE.ShaderMaterial({
    ...cloneShader(gradShader), side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), skyMat);
  scene.add(sky);

  // Slot ghosts are gone with the pre-pivot fixed-chassis robot: the creator
  // bench has no fixed mount points, parts land wherever they're dropped. The
  // empty map is kept so consumers destructuring the scene stay valid.
  const slotMeshes = {};

  // assembly-only scenery — hidden while the sim's arena is on screen
  const assemblyDecor = [floor, shadowCatcher, chassis, sky];

  // ── post-processing: bloom lifts the emissive accents (big fidelity win) ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Restrained bloom: a high threshold so only genuinely bright emissives (the
  // cyan trim, part LEDs, status glow) bloom — lit metal and the backdrop stay
  // crisp. Soften further on low-quality devices (cheaper, still glows).
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    lowQ ? 0.34 : 0.42,   // strength
    lowQ ? 0.5 : 0.55,    // radius
    0.85);                // threshold
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // SMAA anti-aliasing — display-space, so it goes AFTER OutputPass. The composer
  // renders to a non-MSAA target, so without this the emissive/bloom edges shimmer
  // (the single loudest "unfinished 3D" tell). Cheap enough to run on both tiers.
  const smaa = new SMAAPass(1, 1);
  composer.addPass(smaa);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // `bloom` is returned so a backdrop can retune it: the threshold below is set
  // for the dark studio, where only emissives are bright. A daylit white-marble
  // room pushes ordinary lit surfaces past it, and the whole bench hazes over.
  //
  // `studioLights` is the three-point rig above. It is NOT part of assemblyDecor
  // (which only holds meshes), so nothing hides it — a backdrop that brings its
  // own lighting has to switch it off explicitly or the two rigs sum, which
  // both over-exposes the scene and drags a cool blue cast across it.
  const studioLights = [studioHemi, studioAmbient, key, fill, rim, pool];

  /**
   * Retune the entire 3D rig for a theme. Called at boot and whenever the
   * topbar flips `data-theme`.
   *
   * The CSS shell has had a full light token set for a long time, but the 3D
   * view ignored the theme completely — so switching produced a light UI wrapped
   * around a permanently dark bench. Everything that carries the dark studio
   * look is listed here: the visible backdrop dome, the environment map the
   * metals reflect, all six lights, the floor shader, tone-mapping exposure and
   * the bloom pass.
   *
   * The env map is re-baked rather than left alone. It is what every metal part
   * reflects, so leaving a cool dark map under a cream sky makes the parts look
   * grubby in a way that is hard to name but easy to see.
   */
  function setTheme(name) {
    const t = THEME[name] === undefined ? THEME.dark : THEME[name];
    const c = t.col;

    scene.background = new THREE.Color(c.bgHoriz);
    if (scene.fog) scene.fog.color.setHex(c.bgHoriz);

    for (const mat of [skyMat, envDomeMat]) {
      mat.uniforms.top.value.setHex(c.bgTop);
      mat.uniforms.horiz.value.setHex(c.bgHoriz);
      mat.uniforms.bottom.value.setHex(c.bgFloor);
      mat.uniforms.accent.value.setHex(c.accent);
    }
    envBox.material.color.setHex(t.softbox);

    studioHemi.color.setHex(t.hemi.sky);
    studioHemi.groundColor.setHex(t.hemi.ground);
    studioHemi.intensity = t.hemi.intensity;
    studioAmbient.color.setHex(t.ambient.color);
    studioAmbient.intensity = t.ambient.intensity;
    key.color.setHex(c.keyCol);   key.intensity = t.key;
    fill.color.setHex(c.fillCol); fill.intensity = t.fill;
    rim.color.setHex(c.rimCol);   rim.intensity = t.rim;
    pool.color.setHex(t.pool.color); pool.intensity = t.pool.intensity;

    floorUniforms.uBase.value.setHex(t.floor.base);
    floorUniforms.uGrid.value.setHex(t.floor.grid);
    floorUniforms.uAccent.value.setHex(c.accent);

    bloom.strength = lowQ ? t.bloom.lo : t.bloom.hi;
    renderer.toneMappingExposure = t.exposure;

    // Re-bake the reflections from the retinted dome — but ONLY if this studio
    // env map is still the one in use. bench-room.js loads a Poly Haven HDRI and
    // installs it as scene.environment; that IBL is the load-bearing part of how
    // the room looks, and blindly overwriting it here flattened the whole scene
    // (blown-out counter, shadows gone). If something else owns the environment,
    // leave it alone.
    if (scene.environment === null || scene.environment === ownedEnv) {
      const baked = pmrem.fromScene(envScene, 0.04).texture;
      if (ownedEnv) ownedEnv.dispose();
      ownedEnv = baked;
      scene.environment = baked;
    }
  }

  return { renderer, scene, camera, controls, slotMeshes, resize, composer, floorUniforms, assemblyDecor, bloom, studioLights, frameObject, setTheme };
}

// Deep-clone the shared gradient shader's uniforms so each mesh (env dome +
// backdrop) owns its own THREE.Color instances rather than aliasing one set.
function cloneShader(src) {
  const uniforms = {};
  for (const k in src.uniforms) {
    const v = src.uniforms[k].value;
    uniforms[k] = { value: v && v.clone ? v.clone() : v };
  }
  return { uniforms, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader };
}
