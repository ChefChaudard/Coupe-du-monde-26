import Link from "next/link";

export default function HomePage() {
  return (
    <main className="p-10">
      <h1 className="mb-6 text-4xl font-bold">Site de pronostics</h1>
      <Link
        href="/dashboard"
        className="rounded bg-black px-4 py-2 text-white"
      >
        Aller au dashboard
      </Link>
    </main>
  );
}