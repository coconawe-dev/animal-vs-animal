import * as THREE from '../vendor/three.module.js';
import { ANIMALS } from '../src/config.js';
import { buildAnimalModel, animateRig, triggerAttack, triggerSkill } from '../src/models.js';

for (const def of ANIMALS) {
  const rig = buildAnimalModel(def, 'blue');
  rig.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.group);
  const size = new THREE.Vector3(); box.getSize(size);
  let meshes = 0; rig.group.traverse(o => { if (o.isMesh) meshes++; });
  triggerAttack(rig); triggerSkill(rig);
  for (let i=0;i<40;i++) animateRig(rig, { dt: 1/60, moving: true, speed: 3, attack: rig.attack, skill: rig.skill });
  const bad = [box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].some(v=>!Number.isFinite(v));
  console.log(def.id.padEnd(10), 'meshes', String(meshes).padStart(3),
    'size', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2),
    'y', box.min.y.toFixed(2), '~', box.max.y.toFixed(2), bad ? 'NaN!' : '');
}
