// no-client-data-fetch — axios, or fetch('/api/...'), in a Client Component. JSX file, not "use server".
import React from "react";
import axios from "axios";
import http from "axios";
declare const id: string;

// POSITIVE: fetch('/api/...') string literal
export async function load() {
  await fetch("/api/data"); // EXPECT: no-client-data-fetch
}

// POSITIVE: fetch(`/api/${id}`) template
export async function loadOne() {
  await fetch(`/api/${id}`); // EXPECT: no-client-data-fetch
}

// POSITIVE: a backtick URL without substitutions
export async function loadPlain() {
  await fetch(`/api/list`); // EXPECT: no-client-data-fetch
}

// NEGATIVE: external URL
export async function external() {
  await fetch("https://example.com/data");
}

// NEGATIVE: /apiary is no /api route
export async function apiary() {
  await fetch("/apiary/data");
}

// POSITIVE: axios, called as axios.get and under another import name
export async function viaAxios() {
  await axios.get("/users"); // EXPECT: no-client-data-fetch
  await http.post("/users"); // EXPECT: no-client-data-fetch
}

// NEGATIVE: an axios helper that sends no request
export function isRequestError(error: unknown) {
  return axios.isAxiosError(error);
}

// NEGATIVE: a local function named fetch is not the global fetch
export async function localFetch() {
  const fetch = async (url: string) => url;
  await fetch("/api/data");
}

void React;
