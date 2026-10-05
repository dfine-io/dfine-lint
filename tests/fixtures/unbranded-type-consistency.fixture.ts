// unbranded-type-consistency — brand-erasure: a plain string that only ever receives one brand drops it.
type ProjectId = string & { readonly __brand: "ProjectId" };
type UserId = string & { readonly __brand: "UserId" };
declare const projectId: ProjectId;
declare const userId: UserId;

// POSITIVE: every caller passes a ProjectId, the parameter says string
export function load(id: string) { // EXPECT: unbranded-type-consistency
  return id;
}
load(projectId);
load(projectId);

// POSITIVE: a variable annotated string, fed only a ProjectId
export const current: string = projectId; // EXPECT: unbranded-type-consistency

// POSITIVE: a return type string that only ever returns a ProjectId
export function currentProject(): string { // EXPECT: unbranded-type-consistency
  return projectId;
}

// NEGATIVE: the branded annotation keeps the brand
export function loadBranded(id: ProjectId) {
  return id;
}
loadBranded(projectId);

// NEGATIVE: a string utility that receives two different brands
export function label(value: string) {
  return value.toUpperCase();
}
label(projectId);
label(userId);

// NEGATIVE: a utility that also receives a plain string
export function trimmed(value: string) {
  return value.trim();
}
trimmed(projectId);
trimmed(" x ");

// NEGATIVE: exported under another name, callers elsewhere use a name the walk cannot match
function renamed(id: string) {
  return id;
}
renamed(projectId);
export { renamed as aliasRenamed };

// NEGATIVE: a function passed as a value has callers the walk cannot see
function asValue(id: string) {
  return id;
}
asValue(projectId);
export const handlers = [asValue];

// NEGATIVE: += brings a value the walk does not read
export function joined() {
  let path: string = projectId;
  path += "/x";
  return path;
}

// NEGATIVE: an inline callback's parameter has callers it cannot name
export const mapped = [projectId].map((id: string) => id);

// NEGATIVE: a default export has callers the walk cannot name
export default function byDefault(id: string) {
  return id;
}
byDefault(projectId);
