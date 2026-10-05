"use server";
// unbranded-type-consistency — a "use server" export is an RPC endpoint: its arguments arrive over the network.
type ProjectId = string & { readonly __brand: "ProjectId" };
declare const projectId: ProjectId;

// NEGATIVE: a server action's parameter is no brand-erasure target, whatever this file passes it
export async function rename(id: string) {
  return id;
}

export async function caller() {
  return rename(projectId);
}
