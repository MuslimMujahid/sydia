const boards = penpot.currentPage.root.children.filter(
  (s) => s.type === "board" && s.width === 1440
);
const result = [];
for (const b of boards) {
  const key = b.getPluginData("authScreen");
  if (["signup", "signin"].includes(key)) continue;
  if (b.getPluginData("authLayout") === "centered-single-column") continue;
  const cutoff =
    key === "settings" ? 300 : key === "settings-unconnected" ? 300 : 590;
  const content = b.children.filter((s) => s.x - b.x >= cutoff);
  const contentIds = new Set(content.map((s) => s.id));
  if (!content.length)
    throw Error("Missing content; restore board before converting " + key);
  const minY = Math.min(...content.map((s) => s.y - b.y));
  const maxY = Math.max(...content.map((s) => s.y - b.y + s.height));
  const oldX =
    key === "settings" ? 372 : key === "settings-unconnected" ? 480 : 792;
  const width =
    key === "settings" ? 696 : key === "settings-unconnected" ? 560 : 448;
  const newX = (b.width - width) / 2;
  const logo = b.children.find(
    (s) => s.name === "Sydia / exact brand mark" && s.y - b.y < 100
  );
  const wordmark = b.children.find(
    (s) => s.type === "text" && s.characters === "Sydia" && s.y - b.y < 100
  );
  for (const s of [...b.children])
    if (!contentIds.has(s.id) && s.id !== logo?.id && s.id !== wordmark?.id)
      s.remove();
  for (const s of content) s.x += newX - oldX;
  if (logo) {
    logo.x = b.x + newX;
    logo.y = b.y + 48;
  }
  if (wordmark) {
    wordmark.x = b.x + newX + (logo ? logo.width : 32) + 10;
    wordmark.y = b.y + 49;
  }
  const targetY = Math.max(136, (b.height - (maxY - minY)) / 2);
  for (const s of content) s.y += targetY - minY;
  b.setPluginData("authLayout", "centered-single-column");
  result.push({ key, width, x: newX, contentTop: targetY });
}
return { updated: result.length, boards: result };
