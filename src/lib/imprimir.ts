/** Imprime só a página atual em A4 paisagem, sem afetar o print das demais telas. */
export function exportarPdfPaisagem() {
  const style = document.createElement("style");
  style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
  document.head.appendChild(style);
  window.print();
  window.addEventListener("afterprint", () => style.remove(), { once: true });
}
