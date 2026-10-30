import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-5 px-6 py-24">
      <p className="kicker">404</p>
      <h1 className="page-title">Page not found.</h1>
      <p className="text-muted">That address is not on this site.</p>
      <Link href="/" className="btn btn-primary mt-2 w-fit">Back home</Link>
    </main>
  );
}
