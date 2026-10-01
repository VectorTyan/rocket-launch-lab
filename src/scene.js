import * as THREE from 'three';
import { getRocket } from './fleet-data.js';
import { createCinematic } from './cinematic.js';
import { createLaunchVapor } from './plumes.js';
import { createCameraRig } from './rendering/scene/camera-rig.js';
import { computeFramePlacement, observerAltitude } from './rendering/scene/frame-placement.js';
import { createSceneInteractions } from './rendering/scene/interactions.js';
import { createSceneEnvironment } from './rendering/scene/environment.js';
import { createVehicleStage } from './rendering/scene/vehicle-stage.js';
import { createPadOwner } from './rendering/scene/pad-owner.js';
import { createDisposalScope, createViewportBinding } from './rendering/scene/lifecycle.js';

/** Public scene facade: mode state and frame ordering, with explicit resource owners. */
export function createScene(
  container,
  onPartSelect,
  initialRocket = getRocket('falcon9'),
  { onAssemblyDrop } = {},
) {
  const scope = createDisposalScope();
  let disposed = false;
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    scope.defer(() => {
      renderer.dispose();
      renderer.domElement.remove();
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.domElement.setAttribute('aria-label', '可拖动旋转、滚轮缩放的三维火箭场景');
    renderer.domElement.setAttribute('role', 'img');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030a14');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 35000000);
    camera.position.set(105, 55, 140);
    const cinema = createCinematic(renderer, scene, camera);
    scope.defer(() => cinema.dispose());
    const cameraRig = createCameraRig(camera, renderer.domElement);
    scope.defer(() => cameraRig.dispose());
    const environment = createSceneEnvironment({ renderer, scene, camera, cinema });
    scope.defer(() => environment.dispose());
    let interactions = null;
    const stage = createVehicleStage(scene, initialRocket, { cancelDrag: () => interactions?.cancelDrag() });
    scope.defer(() => stage.dispose());
    const pads = createPadOwner(scene);
    scope.defer(() => pads.dispose());
    const vapor = createLaunchVapor();
    scene.add(vapor.mesh);
    scope.defer(() => {
      vapor.mesh.removeFromParent();
      vapor.dispose();
    });
    let mode = 'launch',
      view = 'orbit',
      subject = 'vehicle',
      explode = 0,
      selected = null,
      isolated = false,
      cutawayEnabled = false;
    let assemblyState = { placed: [], selectedId: null };
    interactions = createSceneInteractions({
      element: renderer.domElement,
      container,
      camera,
      controls: cameraRig.controls,
      getContext: () => ({ mode, view, vehicle: stage.vehicle, assemblyView: stage.assembly, assemblyState }),
      onPartSelect,
      onAssemblyDrop,
    });
    scope.defer(() => interactions.dispose());
    const viewport = createViewportBinding(container, renderer, camera, cinema);
    scope.defer(() => viewport.dispose());

    function setSite(site) {
      pads.setSite(site, stage.rocket);
      environment.setSite(site);
      cameraRig.requestReset();
    }
    function setRocket(rocket) {
      if (!stage.setRocket(rocket)) return;
      cutawayEnabled = false;
      selected = null;
      explode = 0;
      isolated = false;
      subject = 'vehicle';
      stage.selection.setTheme(environment.theme);
      stage.selection.setEnabled(mode === 'structure');
      cameraRig.setCutaway(false);
    }
    function setQuality(value) {
      cinema.setQuality(value);
      environment.setQuality(value);
      viewport.resize();
    }
    function setStudioTheme(id) {
      stage.selection.setTheme(environment.setTheme(id));
    }
    function setAssemblyState(state) {
      interactions.cancelDrag();
      assemblyState = { ...state };
      if (mode === 'assembly') stage.ensureAssembly(assemblyState).setState(assemblyState);
    }
    function assemblyFeedback(success) {
      stage.assembly?.showFeedback(success);
    }
    function setCutaway(value) {
      cutawayEnabled = Boolean(value) && mode === 'structure';
      if (cutawayEnabled) {
        explode = 0;
        isolated = false;
        stage.vehicle.setExplode(0);
      }
      stage.cutaway.setFocusPart?.(null);
      stage.cutaway.setEnabled(cutawayEnabled);
      cameraRig.setCutaway(cutawayEnabled);
    }
    function setMode(next) {
      if (next !== mode) stage.releaseAssembly();
      if (next !== 'structure') setCutaway(false);
      mode = next;
      cameraRig.requestReset();
      cameraRig.controls.enablePan = true;
      stage.selection.setEnabled(next === 'structure');
      stage.vehicle.selectPart(null);
      if (next !== 'launch') {
        subject = 'vehicle';
        view = 'orbit';
      }
      if (next === 'assembly') {
        isolated = false;
        selected = null;
        stage.ensureAssembly(assemblyState);
      }
    }
    function setView(next) {
      view = next;
      cameraRig.requestReset();
    }
    function setSubject(next) {
      subject = next;
      cameraRig.requestReset();
    }
    function setExplode(value) {
      if (value > 0 && cutawayEnabled) setCutaway(false);
      explode = value;
      cameraRig.requestReset();
    }
    function focusSelected() {
      if (selected) cameraRig.focus(stage.vehicle.parts.get(selected), { cutawayEnabled });
    }
    function setSelected(id) {
      selected = id;
      stage.vehicle.selectPart(null);
      stage.selection.setSelected(id);
      if (cutawayEnabled && isolated) stage.cutaway.setFocusPart?.(id);
      if (isolated && mode === 'structure' && id) focusSelected();
    }
    function setIsolated(value) {
      isolated = Boolean(value);
      if (cutawayEnabled) stage.cutaway.setFocusPart?.(isolated ? selected : null);
      stage.vehicle.selectPart(null);
      if (!isolated) cameraRig.requestReset();
    }
    function setCutawayOffset(value) {
      stage.cutaway.setOffset(value);
    }

    function update(state, dt = 0) {
      const pad = pads.current;
      if (disposed || !pad) return;
      const { rocket, vehicle, booster, cutaway, selection, exhaust, boosterExhaust } = stage;
      const frame = computeFramePlacement(state, { mode, subject, mount: pad.mount });
      const { anchor, isStudio, isStructure, isAssembly, boosterActive, altitude } = frame;
      vehicle.root.position.copy(frame.primaryWorld).sub(anchor);
      booster.root.position.copy(frame.boosterWorld).sub(anchor);
      vehicle.root.rotation.z = frame.primaryRotation;
      booster.root.rotation.z = frame.boosterRotation;
      pad.group.position.copy(anchor).negate();
      if (isStudio) {
        vehicle.root.position.set(0, 0, 0);
        vehicle.root.rotation.set(0, 0, 0);
        if (isAssembly) stage.ensureAssembly(assemblyState).update(dt);
        else vehicle.setExplode(explode);
        booster.root.visible = false;
        vapor.mesh.visible = false;
        exhaust.group.visible = false;
        if (isStructure && isolated && selected)
          for (const [id, part] of vehicle.parts) part.visible = id === selected;
      } else {
        vehicle.setFlight({
          ...state,
          escapeTowerElapsed: state.escapeElapsed,
          deploymentElapsed: state.deploymentElapsed || 0,
        });
        booster.root.visible = state.separated && (state.hasRecovery || state.stageSeparationElapsed < 70);
        booster.setFlight({
          ...state,
          boosterOnly: true,
          detachedStageOnly: !state.hasRecovery,
          legsDeployed: state.hasRecovery ? THREE.MathUtils.clamp((state.time - 458) / 10, 0, 1) : 0,
          gridFinsDeployed: THREE.MathUtils.clamp(state.stageSeparationElapsed / 8, 0, 1),
        });
        exhaust.group.visible = true;
        exhaust.update(state, { upperBase: vehicle.upperBase });
        boosterExhaust.update(state, { boosterOnly: true, upperBase: vehicle.upperBase });
        vapor.update(state.time, anchor, Math.max(1, rocket.diameter / 3.7));
        pad.update(state.time);
      }
      cameraRig.update({
        mode,
        view,
        rocket,
        vehicle,
        booster,
        state,
        boosterActive,
        altitude,
        anchor,
        explode,
        cutawayEnabled,
        dragging: interactions.isDragging,
        environmentTime: environment.time,
        dt,
      });
      const cameraAltitude = observerAltitude(camera.position, anchor);
      environment.update({ mode, view, state, dt, anchor, cameraAltitude, pad, explode });
      if (cutawayEnabled) cutaway.update();
      selection.update({ camera, width: container.clientWidth, height: container.clientHeight, isolated });
      cinema.render(dt, {
        isStructure: isStudio,
        cameraAltitude,
        anchor,
        standardEnvironment: environment.standardEnvironment,
        studioEnvironment: environment.studioEnvironment,
      });
    }
    setStudioTheme(environment.theme.id);
    const methods = {
      setSite,
      setRocket,
      setQuality,
      setMode,
      setView,
      setSubject,
      setExplode,
      setSelected,
      setIsolated,
      setCutaway,
      setCutawayOffset,
      focusSelected,
      setStudioTheme,
      setAssemblyState,
      assemblyFeedback,
      tryAssemblyDrop: interactions.tryAssemblyDrop,
      getAssemblyTargetScreen: interactions.getAssemblyTargetScreen,
      update,
      resize: viewport.resize,
    };
    return {
      ...Object.fromEntries(
        Object.entries(methods).map(([name, method]) => [
          name,
          (...args) => (disposed ? undefined : method(...args)),
        ]),
      ),
      getInfo() {
        return {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          mode,
          view,
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        scope.dispose();
      },
    };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
