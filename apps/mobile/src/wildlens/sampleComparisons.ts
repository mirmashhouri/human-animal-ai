export type SampleComparison = { id: string; animal: string; caption: string; width: number; height: number; thumbnail: number };

// User-supplied finished comparisons. Viewing a sample never starts an AI request.
export const sampleComparisons: readonly SampleComparison[] = [
  { id: "snowy-owl", animal: "Snowy Owl", caption: "A dreamy, serene Snowy Owl", width: 1800, height: 853,
    thumbnail: require('../../assets/samples/snowy-owl-thumb.webp') },
  { id: "lion", animal: "Lion", caption: "A calm, dreamlike and steadfast Lion", width: 1800, height: 1277,
    thumbnail: require('../../assets/samples/lion-thumb.webp') },
  { id: "thomsons-gazelle", animal: "Thomson's Gazelle", caption: "A dreamy, gentle Thomson's Gazelle", width: 1800, height: 1437,
    thumbnail: require('../../assets/samples/thomsons-gazelle-thumb.webp') },
  { id: "burrowing-owl", animal: "Burrowing Owl", caption: "A dreamy, gentle-eyed Burrowing Owl", width: 1800, height: 1155,
    thumbnail: require('../../assets/samples/burrowing-owl-thumb.webp') },
  { id: "short-crested-cockatoo", animal: "Short-crested Cockatoo", caption: "A dreamy, ethereal Short-crested Cockatoo", width: 1800, height: 1413,
    thumbnail: require('../../assets/samples/short-crested-cockatoo-thumb.webp') },
  { id: "spectacled-bear", animal: "Spectacled Bear", caption: "A dreamy, joyful Spectacled Bear", width: 1800, height: 1296,
    thumbnail: require('../../assets/samples/spectacled-bear-thumb.webp') },
  { id: "harbor-seal", animal: "Harbor Seal", caption: "A calm, dreamy Harbor Seal", width: 1800, height: 1236,
    thumbnail: require('../../assets/samples/harbor-seal-thumb.webp') },
  { id: "meerkat", animal: "Meerkat", caption: "A dreamy, dapper and joyful Meerkat", width: 1800, height: 1392,
    thumbnail: require('../../assets/samples/meerkat-thumb.webp') },
  { id: "emperor-penguin", animal: "Emperor Penguin", caption: "A serene, dreamlike Emperor Penguin", width: 1800, height: 1437,
    thumbnail: require('../../assets/samples/emperor-penguin-thumb.webp') },
  { id: "fawn", animal: "Fawn", caption: "A dreamy, gentle Fawn", width: 1800, height: 1356,
    thumbnail: require('../../assets/samples/fawn-thumb.webp') },
];
