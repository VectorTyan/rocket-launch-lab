import { createVehicle } from '../../fleet-model.js';
import { createCutaway } from '../../cutaway.js';
import { createSelectionView } from '../../selection-view.js';
import { createPlumes } from '../../plumes.js';
import { createAssemblyView } from '../../assembly-view.js';
import { createDisposalScope } from './lifecycle.js';

const defaults = { createVehicle, createCutaway, createSelectionView, createPlumes, createAssemblyView };

/** Owns every rocket-specific resource, including restoring temporary controllers. */
export function createVehicleStage(
  scene,
  initialRocket,
  { cancelDrag = () => {}, factories = defaults } = {},
) {
  let current,
    assembly = null,
    disposed = false;
  function build(rocket) {
    const scope = createDisposalScope();
    try {
      const vehicle = factories.createVehicle(rocket);
      scope.defer(() => vehicle.dispose());
      const booster = factories.createVehicle(rocket);
      scope.defer(() => booster.dispose());
      const cutaway = factories.createCutaway(vehicle, rocket);
      scope.defer(() => cutaway.dispose());
      const selection = factories.createSelectionView(vehicle);
      scope.defer(() => selection.dispose());
      const exhaust = factories.createPlumes(rocket);
      scope.defer(() => {
        vehicle.root.remove(exhaust.group);
        exhaust.dispose();
      });
      const boosterExhaust = factories.createPlumes(rocket);
      scope.defer(() => {
        booster.root.remove(boosterExhaust.group);
        boosterExhaust.dispose();
      });
      vehicle.root.add(exhaust.group);
      booster.root.add(boosterExhaust.group);
      scene.add(vehicle.root, booster.root, selection.group);
      scope.defer(() => scene.remove(vehicle.root, booster.root, selection.group));
      return { rocket, vehicle, booster, cutaway, selection, exhaust, boosterExhaust, scope };
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }
  function releaseAssembly() {
    const previous = assembly;
    try {
      cancelDrag();
    } finally {
      assembly = null;
      previous?.dispose();
    }
  }
  function ensureAssembly(state) {
    if (disposed) return null;
    if (!assembly) {
      const { vehicle, rocket } = current;
      vehicle.root.position.set(0, 0, 0);
      vehicle.root.rotation.set(0, 0, 0);
      vehicle.setExplode(0);
      vehicle.selectPart(null);
      assembly = factories.createAssemblyView(vehicle, rocket);
      assembly.setState(state);
    }
    return assembly;
  }
  current = build(initialRocket);
  return {
    get rocket() {
      return current.rocket;
    },
    get vehicle() {
      return current.vehicle;
    },
    get booster() {
      return current.booster;
    },
    get cutaway() {
      return current.cutaway;
    },
    get selection() {
      return current.selection;
    },
    get exhaust() {
      return current.exhaust;
    },
    get boosterExhaust() {
      return current.boosterExhaust;
    },
    get assembly() {
      return assembly;
    },
    ensureAssembly,
    releaseAssembly,
    setRocket(rocket) {
      if (disposed || rocket.id === current.rocket.id) return false;
      releaseAssembly();
      current.scope.dispose();
      current = build(rocket);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        releaseAssembly();
      } finally {
        current.scope.dispose();
      }
    },
  };
}
