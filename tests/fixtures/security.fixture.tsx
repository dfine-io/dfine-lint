// security — prototype pollution, dangerouslySetInnerHTML, javascript: URL, document.write.
import React from "react";
declare const target: { a: number };
declare const dynKey: string;
declare const userHtml: string;

// POSITIVE: dynamic property assignment (prototype pollution risk, no index signature)
export function pollute() {
  target[dynKey] = 1; // EXPECT: security
}

// POSITIVE: dangerouslySetInnerHTML with non-static value
export const Danger = () => <div dangerouslySetInnerHTML={{ __html: userHtml }} />; // EXPECT: security

// POSITIVE: javascript: URL
export const JsUrl = () => <a href="javascript:alert(1)">x</a>; // EXPECT: security

// POSITIVE: document.write
export function write() {
  document.write("x"); // EXPECT: security
}

// NEGATIVE: static __html literal
export const Safe = () => <div dangerouslySetInnerHTML={{ __html: "<b>ok</b>" }} />;

// NEGATIVE: ordinary href
export const Link = () => <a href="/home">home</a>;

void React;
