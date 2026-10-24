import { strings } from "./strings.ts";

export function App() {
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="text-2xl font-semibold">{strings.appTitle}</h1>
    </main>
  );
}
