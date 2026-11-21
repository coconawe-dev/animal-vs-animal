import { createBattle, simulate } from '../src/sim.js';
const pairs = [['lion','tiger'],['lion','bear'],['tiger','bear'],['elephant','crocodile'],['lion','gorilla'],['tiger','rhino']];
for (const [a,b] of pairs) {
  const w={blue:0,red:0,draw:0};
  for (let i=0;i<40;i++){ const s=createBattle({blue:[a],red:[b],seed:i*97+3}); simulate(s); w[s.winner]++; }
  console.log(a,'vs',b, JSON.stringify(w));
}
