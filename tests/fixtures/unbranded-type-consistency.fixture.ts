// unbranded-type-consistency — *Id parameter typed as plain string must be branded.
type ProjectId = string & { readonly __brand: "ProjectId" };

// POSITIVE: *Id param typed as plain string
export function load(projectId: string) { // EXPECT: unbranded-type-consistency
  return projectId;
}

// NEGATIVE: branded *Id (intersection / type alias → skipped)
export function loadBranded(projectId: ProjectId) {
  return projectId;
}

// NEGATIVE: non-Id parameter
export function other(name: string) {
  return name;
}
