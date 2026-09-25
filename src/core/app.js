// Renderer, camera, lights, water environment and the frame loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { water } from '../water/underwater.js';
import { createWaterDome, createSurface, createGodRays, createMarineSnow } from '../water/environment.js';
import { createComposer } from './postfx.js';

export class App {
  constructor(container, { shot = false } = {}) {
    this.container = container;
    this.shot = shot;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: shot });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.03, 600);
    this.camera.position.set(6, 2.5, 7);

    // Sunlight, refracted through the surface (so slightly steeper than in air).
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0x9fe8f4, 0x0d3440, 1.1);
    this.scene.add(hemi);
    this.hemi = hemi;
    this.syncSun();

    // Visible water
    this.scene.add(createWaterDome());
    this.surface = createSurface();
    this.scene.add(this.surface);
    this.godRays = createGodRays();
    this.scene.add(this.godRays);
    this.snow = createMarineSnow();
    this.scene.add(this.snow);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.autoRotate = !shot;
    this.controls.autoRotateSpeed = 0.25;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 16;
    this.controls.target.set(0, 1, 0);
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      clearTimeout(this._idle);
    });
    this.controls.addEventListener('end', () => {
      clearTimeout(this._idle);
      this._idle = setTimeout(() => (this.controls.autoRotate = !this.shot), 12000);
    });

    const { composer, lens, bloom } = createComposer(renderer, this.scene, this.camera);
    this.composer = composer;
    this.lens = lens;
    this.bloom = bloom;

    this.updatables = [];
    this.time = 0;
    this.groundFn = () => 0;
    this.timer = new THREE.Timer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  syncSun() {
    const d = water.uSunDir.value;
    this.sun.position.copy(d).multiplyScalar(30);
    this.sun.target.position.set(0, 0, 0);
  }

  add(obj) {
    this.scene.add(obj);
    return obj;
  }

  onUpdate(fn) {
    this.updatables.push(fn);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.snow.material.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    this.snow.material.uniforms.uViewportH.value = h;
  }

  step(dt) {
    this.time += dt;
    water.uTime.value = this.time;
    this.lens.uniforms.uTime.value = this.time;
    for (const fn of this.updatables) fn(dt, this.time);
    this.controls.update(dt);
    // Keep the camera in the water and off the sand.
    const cp = this.camera.position;
    const floor = this.groundFn(cp.x, cp.z) + 0.2;
    if (cp.y < floor) cp.y = floor;
    const ceil = water.uSurfaceY.value - 0.25;
    if (cp.y > ceil) cp.y = ceil;
    // Shadow frustum follows the view target.
    const t = this.controls.target;
    this.sun.position.copy(water.uSunDir.value).multiplyScalar(30).add(t);
    this.sun.target.position.copy(t);
  }

  render() {
    this.composer.render();
  }

  start() {
    const loop = () => {
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.step(dt);
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }
}
