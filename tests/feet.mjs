import * as THREE from '../vendor/three.module.js';
import { ANIMALS } from '../src/config.js';
import { buildAnimalModel, animateRig } from '../src/models.js';
for (const def of ANIMALS) {
  const rig = buildAnimalModel(def, 'blue');
  rig.ring.visible = false;
  rig.group.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(rig.group);
  animateRig(rig, { dt: 1/60, moving: true, speed: 3 });
  console.log(def.id.padEnd(10), 'minY', b.min.y.toFixed(2), 'maxY', b.max.y.toFixed(2), 'height', rig.height.toFixed(2), 'bodyY', rig.bodyY.toFixed(2));
}
