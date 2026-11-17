// Class colours: the admin picks one per class; pages of that class use it as the accent.
export const CLASS_COLORS = [
  { id: 'blue', label: 'Blue', swatch: '#2443c4' },
  { id: 'green', label: 'Green', swatch: '#1d7a4b' },
  { id: 'purple', label: 'Purple', swatch: '#6b3fc4' },
  { id: 'orange', label: 'Orange', swatch: '#b8520a' },
  { id: 'teal', label: 'Teal', swatch: '#0b7285' },
  { id: 'rose', label: 'Rose', swatch: '#b42357' },
  { id: 'gold', label: 'Gold', swatch: '#8a6a00' },
  { id: 'slate', label: 'Slate', swatch: '#3f4b5b' },
];
export function applyClassColor(id) {
  const root = document.documentElement;
  if (id && id !== 'blue' && CLASS_COLORS.some((c) => c.id === id)) root.dataset.classColor = id;
  else delete root.dataset.classColor;
}
