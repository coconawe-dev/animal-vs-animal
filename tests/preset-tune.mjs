import { createBattle, simulate } from '../src/sim.js';
const cands = [
  ['하늘A', ['eagle','cheetah','fox'], ['crocodile','boar','bear'], 'canyon'],
  ['하늘B', ['eagle','cheetah','fox'], ['crocodile','boar','gorilla'], 'canyon'],
  ['하늘C', ['eagle','tiger','fox'], ['crocodile','bear','boar'], 'canyon'],
  ['거인A', ['elephant','rhino','gorilla','bear'], ['lion','tiger','crocodile','boar'], 'tundra'],
  ['거인B', ['elephant','rhino','gorilla'], ['lion','tiger','crocodile'], 'tundra'],
  ['거인C', ['elephant','rhino','bear','boar'], ['gorilla','crocodile','lion','tiger'], 'tundra'],
  ['거인D', ['elephant','gorilla','crocodile','cheetah'], ['rhino','bear','lion','tiger'], 'tundra'],
  ['정글A', ['tiger','crocodile','gorilla'], ['lion','elephant','cheetah'], 'savanna'],
  ['정글B', ['tiger','crocodile','boar'], ['lion','bear','cheetah'], 'savanna'],
  ['밸런스A', ['lion','wolf','crocodile'], ['bear','tiger','eagle'], 'tundra'],
];
for (const [name, blue, red, arena] of cands) {
  const w = { blue: 0, red: 0, draw: 0 }; let t = 0;
  for (let i = 0; i < 20; i++) {
    const s = createBattle({ blue, red, arenaId: arena, seed: i * 91 + 13 });
    simulate(s); w[s.winner]++; t += s.time;
  }
  console.log(name.padEnd(8), JSON.stringify(w), '평균', (t / 20).toFixed(1), '초');
}
