// react — a .ts file holds no components: a nested function returning (a + b) is plain code.
export function outer(a: number, b: number) {
  const inner = () => {
    return (a + b);
  };
  return inner();
}
