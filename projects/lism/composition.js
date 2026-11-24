import rows from "./composition.json";

const grid = document.querySelector(".composition");
const assets = "/projects/lism/composition/";

for (const row of rows) {
  const skeleton = assets + row.pose + ".svg";
  for (const id of row.images) {
    const tile = document.createElement("span");
    const photo = new Image();
    photo.alt = "";
    photo.src = assets + id + ".webp";
    const overlay = new Image();
    overlay.alt = "";
    overlay.className = "pose-overlay";
    overlay.src = skeleton;
    tile.append(photo, overlay);
    grid.append(tile);
  }
}
