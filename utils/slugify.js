/**
 * Gera slug amigável a partir de um nome (ex: "Tech Store" -> "tech-store").
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

module.exports = { slugify };
