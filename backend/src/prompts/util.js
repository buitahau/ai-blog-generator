// Escaping angle brackets and ampersands means user text can never close or open a tag,
// so it stays inside its delimiter.
export function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// URLs keep raw & so the writer copies working links; < and > are enough to stay inside the delimiter.
export function escapeAngle(value) {
  return String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function tag(name, value) {
  return `<${name}>${escapeXml(value)}</${name}>`;
}
