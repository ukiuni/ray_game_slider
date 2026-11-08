// Deformed (chibi) animal definitions. Rendering lives in render/animalMesh.js
export const ANIMALS = [
  { id: 'cat', name: 'ネコ', emoji: '🐱', body: 0xf4a259, belly: 0xfff1d6, ear: 'pointy', snout: 'small', extra: 'whiskers' },
  { id: 'dog', name: 'イヌ', emoji: '🐶', body: 0xc8915a, belly: 0xf7e3c6, ear: 'floppy', snout: 'long', extra: 'none' },
  { id: 'pig', name: 'ブタ', emoji: '🐷', body: 0xf7a6b8, belly: 0xffd1dc, ear: 'pointy-small', snout: 'pig', extra: 'none' },
  { id: 'panda', name: 'パンダ', emoji: '🐼', body: 0xf7f7f2, belly: 0xffffff, ear: 'round-dark', snout: 'small', extra: 'eyepatch' },
  { id: 'rabbit', name: 'ウサギ', emoji: '🐰', body: 0xf2f2f7, belly: 0xffe6ee, ear: 'long', snout: 'small', extra: 'none' },
  { id: 'frog', name: 'カエル', emoji: '🐸', body: 0x6cc24a, belly: 0xd9f2b4, ear: 'none', snout: 'none', extra: 'bigeyes' },
  { id: 'bear', name: 'クマ', emoji: '🐻', body: 0x8a5a3b, belly: 0xd9b38c, ear: 'round', snout: 'long', extra: 'none' },
  { id: 'penguin', name: 'ペンギン', emoji: '🐧', body: 0x2d3447, belly: 0xffffff, ear: 'none', snout: 'beak', extra: 'none' },
  { id: 'fox', name: 'キツネ', emoji: '🦊', body: 0xf07b2c, belly: 0xffffff, ear: 'pointy', snout: 'long', extra: 'none' },
  { id: 'chick', name: 'ヒヨコ', emoji: '🐤', body: 0xffd93b, belly: 0xffeb99, ear: 'tuft', snout: 'beak', extra: 'none' },
];

export function animalById(id) {
  return ANIMALS.find((a) => a.id === id) || ANIMALS[0];
}
