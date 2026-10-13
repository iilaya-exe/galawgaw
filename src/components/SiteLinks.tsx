export function SiteLinks() {
  return (
    <nav aria-label="Site information" className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
      {[
        ['about', 'About'], ['help', 'How to play & FAQ'], ['contact', 'Contact'],
        ['privacy', 'Privacy Policy'], ['terms', 'Terms of Use'],
      ].map(([path, label]) => (
        <a key={path} href={`${import.meta.env.BASE_URL}${path}/`} className="underline decoration-current/30 underline-offset-4 hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-4">{label}</a>
      ))}
    </nav>
  );
}
