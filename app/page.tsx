import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-green-900 text-white flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Coupe du Monde 2026</h1>
        <p className="mt-4 text-xl">Site de pronostics entre amis</p>

        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded bg-white px-6 py-3 font-semibold text-green-900 hover:bg-gray-100"
        >
          Accéder au tableau de bord
        </Link>
      </div>
    </main>
  );
}