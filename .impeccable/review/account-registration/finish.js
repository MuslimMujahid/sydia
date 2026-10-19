// Run after the complete desktop/mobile screen and recovery-state batches exist.
const A = storage.auth;
if (!A)
  throw Error(
    "Account registration helpers missing; restore before finishing."
  );
const results = [];
for (const action of A.actions) {
  const destination = A.boards[action.target];
  if (!destination)
    throw Error("Missing prototype destination: " + action.target);
  action.shape.addInteraction("click", { type: "navigate-to", destination });
}
for (const device of ["desktop", "mobile"]) {
  const prefix = device === "desktop" ? "D" : "M";
  const page = A.pages[device];
  page.createFlow(
    "Email registration · " + device,
    A.boards[prefix + "signup"]
  );
  page.createFlow(
    "Existing account verification · " + device,
    A.boards[prefix + "legacy"]
  );
  page.createFlow("Password recovery · " + device, A.boards[prefix + "forgot"]);
  page.createFlow(
    "Explicit Google linking · " + device,
    A.boards[prefix + "google-collision"]
  );
  for (const [key, board] of Object.entries(A.boards).filter(([key]) =>
    key.startsWith(prefix)
  )) {
    const violations = penpotUtils.analyzeDescendants(board, (root, shape) =>
      !penpotUtils.isContainedIn(shape, root)
        ? { id: shape.id, name: shape.name, bounds: shape.bounds }
        : null
    );
    results.push({
      key,
      id: board.id,
      bounds: board.bounds,
      violations: violations.map((v) => v.result),
    });
  }
}
return {
  screenCount: A.screens.length,
  links: A.actions.length,
  boards: results,
};
