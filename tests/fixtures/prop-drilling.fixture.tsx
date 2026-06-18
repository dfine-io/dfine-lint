// prop-drilling — components forwarding >=4 prop units (>=2 callbacks) to custom children unused.
import React from "react";

type Bundle = { x: number; y: number };
type Handlers = { a: () => void; b: () => void };

const cx = (...parts: unknown[]): string => parts.filter(Boolean).join(" ");

function Child(props: { a: number; b: number; c: number; d: number }) {
  return <div>{props.a + props.b + props.c + props.d}</div>;
}

function Wrap(props: {
  p: unknown;
  q: unknown;
  r: unknown;
  s: unknown;
  t: unknown;
}) {
  void props;
  return <div />;
}

function Passthrough(props: { a: number; b: number; c: number; d: number }) {
  void props;
  return <div />;
}

function Box(props: {
  className?: string;
  a?: number;
  b?: number;
  c?: number;
  d?: number;
}) {
  void props;
  return <div />;
}

function record(_args: unknown): void {
  void _args;
}

// POSITIVE: 4 callbacks forwarded straight to a custom child
export function CallbackForwarder({
  onA,
  onB,
  onC,
  onD,
}: {
  onA: () => void;
  onB: () => void;
  onC: () => void;
  onD: () => void;
}) {
  // EXPECT: prop-drilling@45
  return <Wrap p={onA} q={onB} r={onC} s={onD} t={0} />;
}

// POSITIVE: view-model bundle — 2 callbacks (handlers) + 2 data (state), no hooks
export function BundledForwarder({
  state,
  handlers,
}: {
  state: Bundle;
  handlers: Handlers;
}) {
  // EXPECT: prop-drilling@61
  return <Wrap p={state.x} q={state.y} r={handlers.a} s={handlers.b} t={0} />;
}

// POSITIVE: thin-passthrough arrows of 2 callbacks + 2 data
export function PassthroughForwarder({
  handlers,
  state,
}: {
  handlers: Handlers;
  state: Bundle;
}) {
  // EXPECT: prop-drilling@73
  return (
    <Wrap
      p={() => handlers.a()}
      q={() => handlers.b()}
      r={state.x}
      s={state.y}
      t={0}
    />
  );
}

// POSITIVE: non-destructured props — 2 callbacks + 2 data
export function NonDestructured(props: {
  onA: () => void;
  onB: () => void;
  c: number;
  d: number;
}) {
  // EXPECT: prop-drilling@93
  return <Wrap p={props.onA} q={props.onB} r={props.c} s={props.d} t={0} />;
}

// POSITIVE: 2 callbacks + 1 data + one {...spread} = 4 units, 2 callbacks
export function MixedForwarder({
  handlers,
  state,
  extra,
}: {
  handlers: Handlers;
  state: Bundle;
  extra: { s: unknown };
}) {
  // EXPECT: prop-drilling@104
  return <Wrap p={handlers.a} q={handlers.b} r={state.x} t={0} {...extra} />;
}

// NEGATIVE: consumes the props locally
export function Consumer({
  a,
  b,
  c,
  d,
}: {
  a: number;
  b: number;
  c: number;
  d: number;
}) {
  return <div>{a + b + c + d}</div>;
}

// NEGATIVE: all forwarded units also consumed locally — consume cancels per path
export function BundleConsumer({
  state,
  handlers,
}: {
  state: Bundle;
  handlers: Handlers;
}) {
  const sum = state.x + state.y;
  handlers.a();
  handlers.b();
  return <Wrap p={state.x} q={state.y} r={handlers.a} s={handlers.b} t={sum} />;
}

// NEGATIVE: fields only flow into a native element (incl. native spread) — consumed by the DOM
export function NativeConsumer(props: {
  a: string;
  b: string;
  c: string;
  d: string;
}) {
  return <div {...props} data-x={props.a} />;
}

// NEGATIVE: spread-only thin wrapper — one {...spread} unit
export function SpreadOnlyWrapper(props: {
  a: number;
  b: number;
  c: number;
  d: number;
}) {
  return <Passthrough {...props} />;
}

// NEGATIVE: shadcn-style primitive wrapper — className consumed, {...rest} = 1 unit
export function StyledWrapper({
  className,
  ...rest
}: {
  className?: string;
  a?: number;
  b?: number;
  c?: number;
  d?: number;
}) {
  return <Box className={cx("base", className)} {...rest} />;
}

// NEGATIVE: bare callbacks consumed via shorthand arg cancel their forward
export function ShorthandConsumer({
  onA,
  onB,
  onC,
  onD,
}: {
  onA: () => void;
  onB: () => void;
  onC: () => void;
  onD: () => void;
}) {
  record({ onA, onB, onC, onD });
  return <Wrap p={onA} q={onB} r={onC} s={onD} t={0} />;
}

// NEGATIVE: object forwarded whole but a field is read locally (descendant consume)
export function WholeObjectUser({
  file,
  onA,
  onB,
  onC,
}: {
  file: { name: string };
  onA: () => void;
  onB: () => void;
  onC: () => void;
}) {
  record(file.name);
  return <Wrap p={file} q={onA} r={onB} s={onC} t={0} />;
}

// NEGATIVE: value forwarded but value.length read in a sibling attribute condition
export function LengthGuardWrapper({
  text,
  onA,
  onB,
  onC,
}: {
  text: string;
  onA: () => void;
  onB: () => void;
  onC: () => void;
}) {
  return <Wrap p={text} q={onA} r={onB} s={onC} t={text.length > 0} />;
}

// NEGATIVE: pure data fields rendered into display children — no callbacks, not behavior drilling
export function DataRenderer({
  stats,
}: {
  stats: { a: number; b: number; c: number; d: number };
}) {
  return <Wrap p={stats.a} q={stats.b} r={stats.c} s={stats.d} t={0} />;
}

// NEGATIVE: only 1 callback among forwarded units (< 2) — below the behavior threshold
export function OneCallbackForwarder({
  onA,
  data,
}: {
  onA: () => void;
  data: { b: number; c: number; d: number };
}) {
  return <Wrap p={onA} q={data.b} r={data.c} s={data.d} t={0} />;
}

void React;
