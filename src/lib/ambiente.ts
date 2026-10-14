/**
 * Indica se o app está rodando no ambiente de edição (preview do Lovable ou
 * desenvolvimento local). No site publicado o menu e as telas de
 * Administrador ficam ocultos, mesmo para administradores.
 */
export function isAmbienteEdicao(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return true;
  // Hosts de preview usados pelo editor do Lovable.
  const zonasPreview = [
    "lovableproject.com",
    "lovableproject-dev.com",
    "gpt-eng.com",
    "gptengineer.run",
  ];
  if (zonasPreview.some((z) => host === z || host.endsWith("." + z))) return true;
  // No domínio lovable.app, o preview tem prefixo "id-preview--" ou "preview--";
  // o site publicado (<nome>.lovable.app) não.
  if (host.endsWith(".lovable.app") && /^(id-)?preview(-[a-z0-9]+)?--/i.test(host)) return true;
  return false;
}
