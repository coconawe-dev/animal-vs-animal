import { createBattle, simulate } from '../src/sim.js';
const cands = [
  ['하늘D', ['eagle','cheetah','fox','tiger'], ['crocodile','bear','boar'], 'canyon'],
  ['하늘E', ['eagle','cheetah','fox','lion'], ['crocodile','bear','boar'], 'canyon'],
  ['하늘F', ['eagle','cheetah','fox','wolf'], ['crocodile','bear','boar'], 'canyon'],
  ['정글C', ['tiger','crocodile','gorilla'], ['lion','bear','cheetah'], 'savanna'],
  ['정글D', ['tiger','crocodile','boar','fox'], ['lion','elephant','cheetah'], 'savanna'],
  ['정글E', ['tiger','crocodile','gorilla','cheetah'], ['lion','elephant','bear'], 'savanna'],
  ['정글F', ['tiger','gorilla','wolf'], ['lion','bear','cheetah'], 'savanna'],
  ['거인C', ['elephant','rhino','bear','boar'], ['gorilla','crocodile','lion','tiger'], 'tundra'],
  ['거인E', ['elephant','rhino','gorilla','bear'], ['lion','tiger','crocodile','cheetah'], 'tundra'],
];
for (const [name, blue, red, arena] of cands) {
  const w = { blue: 0, red: 0, draw: 0 }; let t = 0;
  for (let i = 0; i < 20; i++) {
    const s = createBattle({ blue, red, arenaId: arena, seed: i * 91 + 13 });
    simulate(s); w[s.winner]++; t += s.time;
  }
  console.log(name.padEnd(8), JSON.stringify(w), '평균', (t / 20).toFixed(1), '초');
}
